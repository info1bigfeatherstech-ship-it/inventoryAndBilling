const asyncHandler = require('../../utils/asyncHandler.utils');
const WarehouseService = require('../../services/warehouse/warehouse.service');
const { successResponse, paginatedMeta } = require('../../utils/response.utils');

const WarehouseController = {
  create: asyncHandler(async (req, res) => {
    const warehouse = await WarehouseService.createWarehouse(req.body);
    return successResponse(res, req, {
      statusCode: 201,
      message: 'Warehouse created successfully',
      data: warehouse,
    });
  }),

  list: asyncHandler(async (req, res) => {
    const { total, page, limit, warehouses } = await WarehouseService.listWarehouses(req.query, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Warehouses fetched successfully',
      data: warehouses,
      meta: paginatedMeta({ page, limit, total }),
    });
  }),

  peerStockSummary: asyncHandler(async (req, res) => {
    const peers = await WarehouseService.listPeerWarehouseStockSummary(req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Peer warehouse stock summary fetched successfully',
      data: peers,
    });
  }),

  getById: asyncHandler(async (req, res) => {
    const warehouse = await WarehouseService.getWarehouseById(req.params.warehouseId, req.user);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Warehouse fetched successfully',
      data: warehouse,
    });
  }),

  update: asyncHandler(async (req, res) => {
    const warehouse = await WarehouseService.updateWarehouse(req.params.warehouseId, req.body);
    return successResponse(res, req, {
      statusCode: 200,
      message: 'Warehouse updated successfully',
      data: warehouse,
    });
  }),

  remove: asyncHandler(async (req, res) => {
    const result = await WarehouseService.softDeleteWarehouse(req.params.warehouseId);
    return successResponse(res, req, {
      statusCode: 200,
      message: result.alreadyInactive ? 'Warehouse already inactive' : 'Warehouse deactivated successfully',
      data: { warehouse_id: req.params.warehouseId, is_active: false },
    });
  }),
};

module.exports = WarehouseController;
