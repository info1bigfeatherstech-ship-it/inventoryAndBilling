const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../middlewares/error.middleware');
const { parsePagination } = require('../../utils/pagination.utils');

const CATEGORY_SELECT = {
  category_id: true,
  name: true,
  description: true,
  parent_id: true,
  is_active: true,
  remarks: true,
  created_at: true,
  updated_at: true,
};

const PARENT_SUMMARY_SELECT = {
  category_id: true,
  name: true,
  is_active: true,
};

const normalizeName = (name) => String(name || '').trim().replace(/\s+/g, ' ');

const normalizeParentId = (parentId) => {
  if (parentId === null || parentId === undefined || parentId === '') return null;
  return String(parentId).trim();
};

const sanitizeCategoryCreate = (data) => ({
  name: normalizeName(data.name),
  description: data.description ?? null,
  parent_id: normalizeParentId(data.parent_id),
  remarks: data.remarks ?? null,
});

const sanitizeCategoryUpdate = (data) => {
  const allowed = ['name', 'description', 'parent_id', 'is_active', 'remarks'];
  const payload = {};

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      payload[key] = data[key];
    }
  }

  if (typeof payload.name === 'string') {
    payload.name = normalizeName(payload.name);
  }

  if (typeof payload.is_active === 'string') {
    const normalized = payload.is_active.trim().toLowerCase();
    if (normalized === 'true') payload.is_active = true;
    if (normalized === 'false') payload.is_active = false;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'parent_id')) {
    payload.parent_id = normalizeParentId(payload.parent_id);
  }

  return payload;
};

const buildCategoryWhere = (filters = {}) => {
  const where = {};

  if (typeof filters.is_active === 'boolean') {
    where.is_active = filters.is_active;
  }

  if (filters.parent_id) {
    where.parent_id = filters.parent_id;
  } else if (filters.roots_only === true) {
    where.parent_id = null;
  }

  if (filters.search) {
    const search = String(filters.search).trim();
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  return where;
};

const getCategoryOrThrow = async (categoryId, select = { category_id: true }) => {
  const category = await prisma.category.findUnique({
    where: { category_id: categoryId },
    select,
  });

  if (!category) {
    throw new AppError('Category not found', 404, 'CATEGORY_NOT_FOUND');
  }

  return category;
};

const assertParentCategoryValid = async (parentId, { excludeCategoryId } = {}) => {
  if (!parentId) return null;

  if (excludeCategoryId && parentId === excludeCategoryId) {
    throw new AppError('Category cannot be its own parent', 400, 'INVALID_PARENT_CATEGORY');
  }

  const parent = await prisma.category.findUnique({
    where: { category_id: parentId },
    select: {
      category_id: true,
      name: true,
      parent_id: true,
      is_active: true,
    },
  });

  if (!parent) {
    throw new AppError('Parent category not found', 404, 'PARENT_CATEGORY_NOT_FOUND');
  }

  if (!parent.is_active) {
    throw new AppError('Parent category is inactive', 400, 'PARENT_CATEGORY_INACTIVE');
  }

  if (parent.parent_id) {
    throw new AppError(
      'Only top-level categories can be used as parent (single-level hierarchy)',
      400,
      'PARENT_MUST_BE_ROOT'
    );
  }

  return parent;
};

const assertNoActiveChildren = async (categoryId) => {
  const activeChildren = await prisma.category.count({
    where: {
      parent_id: categoryId,
      is_active: true,
    },
  });

  if (activeChildren > 0) {
    throw new AppError(
      'Cannot deactivate category with active sub-categories',
      409,
      'CATEGORY_HAS_ACTIVE_CHILDREN',
      { activeChildren }
    );
  }
};

const assertNoActiveProducts = async (categoryId) => {
  const activeProducts = await prisma.product.count({
    where: {
      is_active: true,
      OR: [{ category_id: categoryId }, { sub_category_id: categoryId }],
    },
  });

  if (activeProducts > 0) {
    throw new AppError(
      'Cannot deactivate category linked to active products',
      409,
      'CATEGORY_HAS_ACTIVE_PRODUCTS',
      { activeProducts }
    );
  }
};

const assertDeactivationAllowed = async (categoryId) => {
  await Promise.all([assertNoActiveChildren(categoryId), assertNoActiveProducts(categoryId)]);
};

const assertCanAssignParent = async (categoryId, parentId) => {
  if (!parentId) return;

  const category = await getCategoryOrThrow(categoryId, {
    category_id: true,
    parent_id: true,
    _count: { select: { children: true } },
  });

  if (category._count.children > 0) {
    throw new AppError(
      'Category with sub-categories cannot be moved under another parent',
      400,
      'CATEGORY_HAS_CHILDREN'
    );
  }
};

const CategoryService = {
  async createCategory(data) {
    const payload = sanitizeCategoryCreate(data);

    if (!payload.name) {
      throw new AppError('Category name is required', 400, 'CATEGORY_NAME_REQUIRED');
    }

    await assertParentCategoryValid(payload.parent_id);

    const category = await prisma.category.create({
      data: payload,
      select: {
        ...CATEGORY_SELECT,
        parent: { select: PARENT_SUMMARY_SELECT },
        _count: { select: { children: true, products: true, sub_products: true } },
      },
    });

    return category;
  },

  async listCategories(query = {}) {
    const { page, limit, skip, take } = parsePagination(query, { page: 1, limit: 50, maxLimit: 100 });

    const filters = { ...query };
    if (filters.parent_id) {
      await getCategoryOrThrow(filters.parent_id, { category_id: true });
    }

    const where = buildCategoryWhere(filters);

    const [total, categories] = await Promise.all([
      prisma.category.count({ where }),
      prisma.category.findMany({
        where,
        skip,
        take,
        orderBy: [{ is_active: 'desc' }, { name: 'asc' }],
        select: {
          ...CATEGORY_SELECT,
          parent: { select: PARENT_SUMMARY_SELECT },
          _count: { select: { children: true, products: true, sub_products: true } },
        },
      }),
    ]);

    return { total, page, limit, categories };
  },

  async getActiveCategoryNames() {
    const categories = await prisma.category.findMany({
      where: { is_active: true },
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    return categories.map((category) => category.name);
  },

  async getCategoryById(categoryId) {
    const category = await prisma.category.findUnique({
      where: { category_id: categoryId },
      select: {
        ...CATEGORY_SELECT,
        parent: { select: PARENT_SUMMARY_SELECT },
        children: {
          orderBy: { name: 'asc' },
          select: {
            ...CATEGORY_SELECT,
            _count: { select: { products: true, sub_products: true } },
          },
        },
        _count: { select: { children: true, products: true, sub_products: true } },
      },
    });

    if (!category) {
      throw new AppError('Category not found', 404, 'CATEGORY_NOT_FOUND');
    }

    return category;
  },

  async updateCategory(categoryId, data) {
    const payload = sanitizeCategoryUpdate(data);
    if (Object.keys(payload).length === 0) {
      throw new AppError('No updatable fields provided', 400, 'EMPTY_UPDATE');
    }

    const existing = await getCategoryOrThrow(categoryId, {
      category_id: true,
      parent_id: true,
      is_active: true,
    });

    if (Object.prototype.hasOwnProperty.call(payload, 'parent_id')) {
      const nextParentId = payload.parent_id ?? null;
      if (nextParentId !== existing.parent_id) {
        await assertCanAssignParent(categoryId, nextParentId);
        await assertParentCategoryValid(nextParentId, { excludeCategoryId: categoryId });
      }
    }

    if (payload.is_active === false && existing.is_active) {
      await assertDeactivationAllowed(categoryId);
    }

    const category = await prisma.category.update({
      where: { category_id: categoryId },
      data: payload,
      select: {
        ...CATEGORY_SELECT,
        parent: { select: PARENT_SUMMARY_SELECT },
        _count: { select: { children: true, products: true, sub_products: true } },
      },
    });

    return category;
  },

  async softDeleteCategory(categoryId) {
    const existing = await getCategoryOrThrow(categoryId, {
      category_id: true,
      is_active: true,
    });

    if (!existing.is_active) {
      return { alreadyInactive: true };
    }

    await assertDeactivationAllowed(categoryId);

    await prisma.category.update({
      where: { category_id: categoryId },
      data: { is_active: false },
      select: { category_id: true },
    });

    return { alreadyInactive: false };
  },
};

module.exports = CategoryService;
