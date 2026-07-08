/**
 * Backfill "-1" suffix on primary/only variant product_code (and matching SKU).
 *
 * WHY: Older products were created before the "primary variant = BASE-1" rule.
 * Their primary variant's `product_code` is still the bare base (e.g. "2685"),
 * so the UI shows "2685" instead of "2685-1". This script adds the "-1" suffix
 * to those variants so they match how new products are created.
 *
 * SAFE BY DESIGN:
 *   - Runs in DRY-RUN by default (prints the plan, changes NOTHING).
 *   - NEVER deletes any row. Only UPDATEs product_code (and optionally sku).
 *   - Skips (with a warning) anything ambiguous or that would collide.
 *   - Product-level `product_code` (the base) is left untouched — correct.
 *   - `system_barcode` is left untouched by default so already-printed barcode
 *     labels keep scanning (scan matches system_barcode, NOT product_code).
 *
 * USAGE (run from the backend/ folder on the VPS):
 *   1) Dry run (recommended first — shows what WOULD change):
 *        node scripts/backfill-primary-variant-code.js
 *   2) Apply the changes for real:
 *        APPLY=true node scripts/backfill-primary-variant-code.js
 *
 * OPTIONS (env vars):
 *   APPLY=true         Actually write changes (default: false = dry run)
 *   SYNC_SKU=false     Do NOT touch sku (default: true = keep sku in sync as SKU-<newCode>)
 *   SYNC_BARCODE=true  Also set system_barcode = newCode (default: false — see warning above)
 */

const prisma = require('../src/utils/prisma.utils');

const APPLY = String(process.env.APPLY || '').toLowerCase() === 'true';
const SYNC_SKU = String(process.env.SYNC_SKU || 'true').toLowerCase() !== 'false';
const SYNC_BARCODE = String(process.env.SYNC_BARCODE || '').toLowerCase() === 'true';

// A variant code already has a serial when it ends with "-<number>" (e.g. "2685-1").
const HAS_SERIAL_SUFFIX = /-\d+$/;

const isBareCode = (code) => !!code && !HAS_SERIAL_SUFFIX.test(String(code).trim());

/** SKU looks auto-generated when it is "SKU-<oldCode>" or exactly the bare code. */
const isAutoSku = (sku, oldCode) => {
  const s = String(sku || '').trim();
  return s === `SKU-${oldCode}` || s === oldCode;
};

const main = async () => {
  console.log('────────────────────────────────────────────────────────');
  console.log('Primary-variant product_code backfill (add "-1")');
  console.log(`  MODE        : ${APPLY ? 'APPLY (writing changes)' : 'DRY RUN (no changes)'}`);
  console.log(`  SYNC_SKU    : ${SYNC_SKU}`);
  console.log(`  SYNC_BARCODE: ${SYNC_BARCODE}${SYNC_BARCODE ? '  (may affect old printed labels)' : ''}`);
  console.log('────────────────────────────────────────────────────────');

  // Pull every product with its variants. Only the fields we need.
  const products = await prisma.product.findMany({
    select: {
      product_id: true,
      product_code: true,
      name: true,
      warehouse_id: true,
      variants: {
        select: {
          variant_id: true,
          product_code: true,
          sku: true,
          system_barcode: true,
          is_default: true,
          sort_order: true,
        },
      },
    },
  });

  const planned = []; // { variant_id, name, oldCode, newCode, sku?, system_barcode? }
  const warnings = []; // strings

  for (const product of products) {
    const variants = product.variants || [];
    const bareVariants = variants.filter((v) => isBareCode(v.product_code));
    if (bareVariants.length === 0) continue;

    // Which single variant should receive the "-1"?
    let target = null;
    if (variants.length === 1) {
      target = variants[0]; // single-variant product → its only variant is primary
    } else {
      const bareDefaults = bareVariants.filter((v) => v.is_default === true);
      if (bareVariants.length === 1 && bareDefaults.length <= 1) {
        target = bareVariants[0]; // exactly one bare code in a multi-variant product
      } else {
        warnings.push(
          `SKIP product "${product.product_code}" (${product.name}) — ${bareVariants.length} bare variant codes ` +
            `[${bareVariants.map((v) => v.product_code).join(', ')}]. Ambiguous; fix manually.`
        );
        continue;
      }
    }

    const oldCode = String(target.product_code).trim();
    const newCode = `${oldCode}-1`;

    // Collision guard: another variant in the same product must not already own newCode.
    const codeClash = variants.some(
      (v) => v.variant_id !== target.variant_id && String(v.product_code).trim() === newCode
    );
    if (codeClash) {
      warnings.push(
        `SKIP variant ${target.variant_id} in product "${product.product_code}" — ` +
          `"${newCode}" already exists on another variant.`
      );
      continue;
    }

    const change = { variant_id: target.variant_id, name: product.name, oldCode, newCode };

    // Optional SKU sync — only when the current SKU is auto-generated, and no clash.
    if (SYNC_SKU && isAutoSku(target.sku, oldCode)) {
      const newSku = `SKU-${newCode}`;
      const skuClash = variants.some(
        (v) => v.variant_id !== target.variant_id && String(v.sku || '').trim() === newSku
      );
      if (skuClash) {
        warnings.push(
          `NOTE product "${product.product_code}" — SKU "${newSku}" already used; keeping old SKU "${target.sku}".`
        );
      } else {
        change.sku = newSku;
        change.oldSku = target.sku;
      }
    }

    // Optional barcode sync — off by default.
    if (SYNC_BARCODE) {
      const barClash = variants.some(
        (v) => v.variant_id !== target.variant_id && String(v.system_barcode || '').trim() === newCode
      );
      if (barClash) {
        warnings.push(
          `NOTE product "${product.product_code}" — system_barcode "${newCode}" already used; keeping old barcode.`
        );
      } else {
        change.system_barcode = newCode;
        change.oldBarcode = target.system_barcode;
      }
    }

    planned.push(change);
  }

  // ---- Report ----
  console.log(`\nProducts scanned  : ${products.length}`);
  console.log(`Variants to update: ${planned.length}`);
  if (warnings.length) {
    console.log(`\nWarnings (${warnings.length}):`);
    warnings.forEach((w) => console.log(`  - ${w}`));
  }

  if (planned.length) {
    console.log('\nPlanned changes:');
    planned.forEach((c) => {
      const parts = [`product_code "${c.oldCode}" -> "${c.newCode}"`];
      if (c.sku) parts.push(`sku "${c.oldSku}" -> "${c.sku}"`);
      if (c.system_barcode) parts.push(`barcode "${c.oldBarcode}" -> "${c.system_barcode}"`);
      console.log(`  - [${c.name}] ${parts.join(' | ')}`);
    });
  }

  if (!APPLY) {
    console.log('\nDRY RUN complete. No changes were written.');
    console.log('Re-run with  APPLY=true  to apply the changes above.');
    return;
  }

  if (planned.length === 0) {
    console.log('\nNothing to update. Done.');
    return;
  }

  // ---- Apply inside a single transaction (all-or-nothing) ----
  console.log('\nApplying changes in a transaction...');
  await prisma.$transaction(
    planned.map((c) => {
      const data = { product_code: c.newCode };
      if (c.sku) data.sku = c.sku;
      if (c.system_barcode) data.system_barcode = c.system_barcode;
      return prisma.productVariant.update({
        where: { variant_id: c.variant_id },
        data,
      });
    })
  );

  console.log(`Updated ${planned.length} variant(s) successfully.`);
};

main()
  .catch((err) => {
    console.error('\nBackfill failed — transaction rolled back, no partial changes were committed.');
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
