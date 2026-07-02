/**
 * Canonical user role identifiers — must stay in sync with Prisma `UserRole` enum.
 */
const UserRole = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN',
  WH_MANAGER: 'WH_MANAGER',
  WH_STOCK_LISTER: 'WH_STOCK_LISTER',
  SHOP_OWNER: 'SHOP_OWNER',
  BILLING_STAFF: 'BILLING_STAFF',
  SHOP_MANAGER: 'SHOP_MANAGER',
});

/** Shop-assigned staff scoped to `user.shopId` (owner may also resolve via owned shop). */
const SHOP_STAFF_ROLES = Object.freeze([
  UserRole.SHOP_OWNER,
  UserRole.SHOP_MANAGER,
  UserRole.BILLING_STAFF,
]);

/** Shop deputies: inventory, transfers, expenses — not billing collections or team admin. */
const SHOP_OPERATION_ROLES = Object.freeze([
  UserRole.SHOP_OWNER,
  UserRole.SHOP_MANAGER,
]);

/** Roles allowed to create / approve / dispatch / receive shop-side transfers. */
const SHOP_TRANSFER_ACTOR_ROLES = Object.freeze([
  UserRole.SHOP_OWNER,
  UserRole.SHOP_MANAGER,
]);

/** May view bills and billing reports. */
const SHOP_BILLING_READ_ROLES = Object.freeze([
  UserRole.SHOP_OWNER,
  UserRole.BILLING_STAFF,
  UserRole.SHOP_MANAGER,
]);

/** May create bills, record payments, and mutate credit notes. */
const SHOP_BILLING_WRITE_ROLES = Object.freeze([
  UserRole.SHOP_OWNER,
  UserRole.BILLING_STAFF,
]);

/** Shop team roster roles (listed under Team Members for shop owner). */
const SHOP_TEAM_ROLES = Object.freeze([
  UserRole.SHOP_OWNER,
  UserRole.BILLING_STAFF,
  UserRole.SHOP_MANAGER,
]);

const SHOP_OWNER_CREATABLE_TEAM_ROLES = Object.freeze([
  UserRole.BILLING_STAFF,
  UserRole.SHOP_MANAGER,
]);

const SHOP_OWNER_EDITABLE_TEAM_ROLES = Object.freeze([
  UserRole.BILLING_STAFF,
  UserRole.SHOP_MANAGER,
]);

const toRoleSet = (roles) => new Set(roles);

const isShopStaff = (role) => SHOP_STAFF_ROLES.includes(role);
const isShopOwner = (role) => role === UserRole.SHOP_OWNER;
const isShopManager = (role) => role === UserRole.SHOP_MANAGER;
const isShopOwnerOrManager = (role) => isShopOwner(role) || isShopManager(role);
const isShopTransferActor = (role) => SHOP_TRANSFER_ACTOR_ROLES.includes(role);
const isShopBillingRead = (role) => SHOP_BILLING_READ_ROLES.includes(role);
const isShopBillingWrite = (role) => SHOP_BILLING_WRITE_ROLES.includes(role);

module.exports = {
  UserRole,
  SHOP_STAFF_ROLES,
  SHOP_OPERATION_ROLES,
  SHOP_TRANSFER_ACTOR_ROLES,
  SHOP_BILLING_READ_ROLES,
  SHOP_BILLING_WRITE_ROLES,
  SHOP_TEAM_ROLES,
  SHOP_OWNER_CREATABLE_TEAM_ROLES,
  SHOP_OWNER_EDITABLE_TEAM_ROLES,
  toRoleSet,
  isShopStaff,
  isShopOwner,
  isShopManager,
  isShopOwnerOrManager,
  isShopTransferActor,
  isShopBillingRead,
  isShopBillingWrite,
};
