/**
 * CSV export for stock ledger (audit).
 */

const escapeCsv = (value) => {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const LEDGER_CSV_HEADERS = [
  'ledger_id',
  'created_at',
  'movement_type',
  'product_id',
  'variant_id',
  'product_name',
  'sku',
  'quantity',
  'unit_cost',
  'line_value',
  'from_warehouse_id',
  'to_warehouse_id',
  'from_shop_id',
  'to_shop_id',
  'reference_type',
  'reference_id',
  'batch_number',
  'remarks',
];

const ledgerRowsToCsv = (rows) => {
  const lines = [LEDGER_CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.ledger_id,
        row.created_at ? new Date(row.created_at).toISOString() : '',
        row.movement_type,
        row.product_id,
        row.variant_id,
        row.product_name,
        row.variant_sku,
        row.quantity,
        row.unit_cost,
        row.line_value,
        row.from_warehouse_id,
        row.to_warehouse_id,
        row.from_shop_id,
        row.to_shop_id,
        row.reference_type,
        row.reference_id,
        row.batch_number,
        row.remarks,
      ]
        .map(escapeCsv)
        .join(',')
    );
  }
  return `${lines.join('\n')}\n`;
};

module.exports = {
  LEDGER_CSV_HEADERS,
  ledgerRowsToCsv,
};
