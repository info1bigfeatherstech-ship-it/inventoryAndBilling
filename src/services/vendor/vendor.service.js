const prisma = require('../../utils/prisma.utils');
const { AppError } = require('../../middlewares/error.middleware');
const { parsePagination } = require('../../utils/pagination.utils');

const buildVendorWhere = (filters = {}) => {
  const where = {};

  if (typeof filters.is_active === 'boolean') {
    where.is_active = filters.is_active;
  }

  if (filters.business_type) {
    where.business_type = filters.business_type;
  }

  if (filters.city) {
    where.city = { contains: filters.city, mode: 'insensitive' };
  }

  if (filters.search) {
    const s = String(filters.search).trim();
    where.OR = [
      { company_name: { contains: s, mode: 'insensitive' } },
      { phone: { contains: s } },
      { email: { contains: s, mode: 'insensitive' } },
    ];
  }

  return where;
};

const sanitizeVendorCreate = (data) => {
  const payload = {
    company_name: data.company_name,
    contact_person: data.contact_person ?? null,
    phone: data.phone,
    whatsapp: data.whatsapp ?? null,
    email: data.email ?? null,
    gst_number: data.gst_number ?? null,
    vendor_type: data.vendor_type ?? null,
    supply_city: data.supply_city,
    business_type: data.business_type,
    city: data.city,
    address: data.address ?? null,
    remarks: data.remarks ?? null,
  };

  return payload;
};

const sanitizeVendorUpdate = (data) => {
  const allowed = [
    'company_name',
    'contact_person',
    'phone',
    'whatsapp',
    'email',
    'gst_number',
    'vendor_type',
    'supply_city',
    'business_type',
    'city',
    'address',
    'is_active',
    'remarks',
  ];

  const out = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      out[key] = data[key];
    }
  }

  // Defensive normalization in case upstream sends boolean-like strings.
  if (typeof out.is_active === 'string') {
    const normalized = out.is_active.trim().toLowerCase();
    if (normalized === 'true') out.is_active = true;
    if (normalized === 'false') out.is_active = false;
  }

  return out;
};

const VendorService = {
  async createVendor(data) {
    const payload = sanitizeVendorCreate(data);
    const vendor = await prisma.vendor.create({
      data: payload,
      select: {
        vendor_id: true,
        company_name: true,
        contact_person: true,
        phone: true,
        whatsapp: true,
        email: true,
        gst_number: true,
        vendor_type: true,
        supply_city: true,
        business_type: true,
        city: true,
        address: true,
        is_active: true,
        remarks: true,
        created_at: true,
        updated_at: true,
      },
    });
    return vendor;
  },

  async listVendors(query = {}) {
    const { page, limit, skip, take } = parsePagination(query, { page: 1, limit: 50, maxLimit: 100 });
    const where = buildVendorWhere(query);

    const [total, vendors] = await Promise.all([
      prisma.vendor.count({ where }),
      prisma.vendor.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        select: {
          vendor_id: true,
          company_name: true,
          phone: true,
          whatsapp: true,
          email: true,
          gst_number: true,
          vendor_type: true,
          supply_city: true,
          business_type: true,
          city: true,
          address: true,
          is_active: true,
          remarks: true,
          created_at: true,
          updated_at: true,
          _count: { select: { products: true, purchase_entries: true } },
        },
      }),
    ]);

    return { total, page, limit, vendors };
  },

  async getActiveVendorNames() {
    const vendors = await prisma.vendor.findMany({
      where: { is_active: true },
      select: { company_name: true },
      orderBy: { company_name: 'asc' },
    });
    return vendors.map((vendor) => vendor.company_name);
  },

  async getVendorById(vendorId) {
    const vendor = await prisma.vendor.findUnique({
      where: { vendor_id: vendorId },
      select: {
        vendor_id: true,
        company_name: true,
        contact_person: true,
        phone: true,
        whatsapp: true,
        email: true,
        gst_number: true,
        vendor_type: true,
        supply_city: true,
        business_type: true,
        city: true,
        address: true,
        is_active: true,
        remarks: true,
        created_at: true,
        updated_at: true,
        _count: { select: { products: true, purchase_entries: true } },
      },
    });

    if (!vendor) {
      throw new AppError('Vendor not found', 404, 'VENDOR_NOT_FOUND');
    }

    return vendor;
  },

  async updateVendor(vendorId, data) {
    const payload = sanitizeVendorUpdate(data);
    if (Object.keys(payload).length === 0) {
      throw new AppError('No updatable fields provided', 400, 'EMPTY_UPDATE');
    }

    const exists = await prisma.vendor.findUnique({
      where: { vendor_id: vendorId },
      select: { vendor_id: true },
    });
    if (!exists) {
      throw new AppError('Vendor not found', 404, 'VENDOR_NOT_FOUND');
    }

    const vendor = await prisma.vendor.update({
      where: { vendor_id: vendorId },
      data: payload,
      select: {
        vendor_id: true,
        company_name: true,
        contact_person: true,
        phone: true,
        whatsapp: true,
        email: true,
        gst_number: true,
        vendor_type: true,
        supply_city: true,
        business_type: true,
        city: true,
        address: true,
        is_active: true,
        remarks: true,
        created_at: true,
        updated_at: true,
      },
    });

    return vendor;
  },

  async softDeleteVendor(vendorId) {
    const exists = await prisma.vendor.findUnique({
      where: { vendor_id: vendorId },
      select: { vendor_id: true, is_active: true },
    });
    if (!exists) {
      throw new AppError('Vendor not found', 404, 'VENDOR_NOT_FOUND');
    }

    if (!exists.is_active) {
      return { alreadyInactive: true };
    }

    await prisma.vendor.update({
      where: { vendor_id: vendorId },
      data: { is_active: false },
      select: { vendor_id: true },
    });

    return { alreadyInactive: false };
  },
};

module.exports = VendorService;
