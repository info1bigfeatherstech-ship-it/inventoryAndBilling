const { AppError } = require('../middlewares/error.middleware');
const {
  UserRole,
  isSuperAdminRole,
  isOrgManagerRole,
  isOrgLevelAdminRole,
  isPrivilegedRole,
  expandRolesForAuthorization,
} = require('../constants/userRole.constants');

const DEFAULT_ORG_MANAGER_TITLE = 'Org Manager';
const MAX_ROLE_TITLE_LENGTH = 80;

const roleOf = (userOrRole) =>
  typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;

const isSuperAdmin = (userOrRole) => isSuperAdminRole(roleOf(userOrRole));
const isOrgManager = (userOrRole) => isOrgManagerRole(roleOf(userOrRole));
const isOrgLevelAdmin = (userOrRole) => isOrgLevelAdminRole(roleOf(userOrRole));
const isPrivilegedUser = (userOrRole) => isPrivilegedRole(roleOf(userOrRole));

const isRoleTitleUnavailable = (err) => {
  if (!err) return false;
  const msg = String(err.message || '');
  const column = String(err.meta?.column || err.meta?.field_name || '');
  if (err.code === 'P2022' && /role_title/i.test(`${column} ${msg}`)) return true;
  if (/Unknown (?:arg|field|argument).*role_title/i.test(msg)) return true;
  if (/column ["']?role_title["']? (?:does not exist|doesn't exist)/i.test(msg)) return true;
  return false;
};

const isOrgManagerEnumUnavailable = (err) => {
  if (!err) return false;
  const msg = String(err.message || '');
  if (/ORG_MANAGER/i.test(msg) && ['P2006', 'P2012', 'P2023'].includes(err.code)) return true;
  if (/invalid input value for enum.*ORG_MANAGER/i.test(msg)) return true;
  if (/ORG_MANAGER.*not (?:found|exist|a valid)/i.test(msg)) return true;
  return false;
};

const mapOrgManagerSchemaError = (err, fallbackMessage = 'Failed to save user') => {
  if (isRoleTitleUnavailable(err) || isOrgManagerEnumUnavailable(err)) {
    throw new AppError(
      'ORG_MANAGER is not set up on this database yet. Run prisma migrate deploy, then npx prisma generate, then restart the API.',
      500,
      'DB_SCHEMA_OUT_OF_DATE'
    );
  }
  if (err instanceof AppError) throw err;
  throw err;
};

const normalizeRoleTitle = (value, { required = false } = {}) => {
  if (value == null) {
    if (required) {
      throw new AppError(
        'role_title is required when creating an Org Manager',
        400,
        'ROLE_TITLE_REQUIRED'
      );
    }
    return null;
  }

  const title = String(value).trim();
  if (!title) {
    if (required) {
      throw new AppError(
        'role_title is required when creating an Org Manager',
        400,
        'ROLE_TITLE_REQUIRED'
      );
    }
    return null;
  }

  if (title.length > MAX_ROLE_TITLE_LENGTH) {
    throw new AppError(
      `role_title must be at most ${MAX_ROLE_TITLE_LENGTH} characters`,
      400,
      'ROLE_TITLE_TOO_LONG'
    );
  }

  return title;
};

const displayRoleTitle = (roleTitle) => {
  const title = String(roleTitle || '').trim();
  return title || DEFAULT_ORG_MANAGER_TITLE;
};

module.exports = {
  UserRole,
  DEFAULT_ORG_MANAGER_TITLE,
  MAX_ROLE_TITLE_LENGTH,
  isSuperAdmin,
  isOrgManager,
  isOrgLevelAdmin,
  isPrivilegedUser,
  expandRolesForAuthorization,
  isRoleTitleUnavailable,
  isOrgManagerEnumUnavailable,
  mapOrgManagerSchemaError,
  normalizeRoleTitle,
  displayRoleTitle,
};
