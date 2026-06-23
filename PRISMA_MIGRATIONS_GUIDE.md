# PRISMA MIGRATIONS - COMPLETE GUIDE & BEST PRACTICES

## 📋 WORKFLOW FOR NEW TABLES/FIELDS

### Step 1: Modify your schema (prisma/schema.prisma)
```prisma
model NewTable {
  id String @id @default(cuid())
  name String
  // add your fields
}
```

### Step 2: Create migration (DO THIS - don't skip!)
```bash
npx prisma migrate dev --name descriptive_name
```
This will:
- Create migration folder with SQL
- Apply changes to database
- Generate/update Prisma Client

### Step 3: Push to Git
```bash
git add prisma/migrations/
git commit -m "Add NewTable migration"
```

---

## ❌ COMMON MISTAKES TO AVOID

### ❌ Mistake 1: Direct Database Changes Without Migration
```bash
# DON'T DO THIS:
# - Manually modify database
# - Then run: npx prisma generate
# 
# This causes SCHEMA DRIFT (database and schema out of sync)
```

### ❌ Mistake 2: Modifying Old Migrations After Apply
```bash
# DON'T DO THIS:
# - Change migration file that was already applied
# - Database has already executed the old migration
# - Creating new migration is the right way
```

### ❌ Mistake 3: Ignoring Migration Errors
```bash
# When migration fails:
# - Read the error message carefully
# - Don't just reset everything
# - Try to understand what went wrong
```

### ❌ Mistake 4: Using migrate dev/reset in Production
```bash
# NEVER USE IN PRODUCTION:
# - npx prisma migrate dev
# - npx prisma migrate reset
# 
# These are development-only commands
```

---

## ✅ WHAT TO DO WHEN - SPECIFIC SCENARIOS

### Scenario 1: Add a New Optional Field
```bash
# 1. Update schema.prisma:
model Product {
  id String @id @default(cuid())
  name String
  description String?  // ← NEW OPTIONAL FIELD
}

# 2. Run:
npx prisma migrate dev --name add_description_to_products

# Result: Migration created, applied, Prisma Client generated
# Status: ✅ DONE
```

### Scenario 2: Add a New Required Field to Existing Table
```bash
# ⚠️ This is tricky with existing data!

# Option A: Add optional first, fill data, then make required
# Step 1: Add as optional
model Customer {
  status String?  // ← optional first
}
npx prisma migrate dev --name add_status_optional

# Step 2: Fill existing records in database (manual SQL or script)
# Step 3: Add new migration to make NOT NULL
model Customer {
  status String  // ← now required
}
npx prisma migrate dev --name make_status_required

# Option B: Provide default value
model Customer {
  status String @default("ACTIVE")
}
npx prisma migrate dev --name add_status_with_default
```

### Scenario 3: Add Unique Constraint
```bash
# 1. Update schema.prisma:
model User {
  email String @unique
}

# 2. Run:
npx prisma migrate dev --name add_email_unique
```

### Scenario 4: Add Index for Performance
```bash
# 1. Update schema.prisma:
model Bill {
  id String @id
  shop_id String
  created_at DateTime
  
  @@index([shop_id, created_at])  // ← compound index
}

# 2. Run:
npx prisma migrate dev --name add_bill_shop_created_index
```

### Scenario 5: Create a New Relation Between Tables
```bash
# 1. Update schema.prisma:
model Author {
  id String @id
  posts Post[]  // ← relation
}

model Post {
  id String @id
  author_id String
  author Author @relation(fields: [author_id], references: [id])
}

# 2. Run:
npx prisma migrate dev --name add_author_post_relation
```

### Scenario 6: Rename a Field
```bash
# 1. Update schema.prisma:
model Product {
  old_name String  // ← rename to 'display_name'
}

# Better approach:
# Step 1: Add new field, copy data, then drop old
model Product {
  display_name String  // ← NEW
}
npx prisma migrate dev --name add_display_name

# Step 2: After data migration, drop old field
npx prisma migrate dev --name drop_old_name

# Or use raw SQL in migration if needed
```

---

## 🔧 MIGRATION FOLDER GROWING PROBLEM

### Problem: Why migrations folder keeps growing
```
Each schema change = 1 new migration folder
After many changes: prisma/migrations/20260525*, 20260526*, 20260527*, ...
```

### Solution 1: Squash Migrations (Development Only!)
```bash
# ⚠️ ONLY DO THIS IN DEVELOPMENT, NEVER IN PRODUCTION!

# Step 1: Delete old migrations (except deployed ones)
rm -r prisma/migrations/20260525_*
rm -r prisma/migrations/20260526_*

# Step 2: Create single fresh migration
npx prisma migrate dev --name fresh_start_v2

# This compresses all history into one migration
```

### Solution 2: Start Fresh (Development Only!)
```bash
# ⚠️ ONLY IN DEVELOPMENT - DELETES ALL DATA!

npx prisma migrate reset --force

# This:
# - Drops entire database
# - Recreates it fresh
# - Applies all migrations from scratch
# - Better for starting over
```

### Solution 3: Keep Clean Migration History
```bash
# Best practice: DON'T squash in development
# Keep all migrations as historical record
# This shows what changed and when
# Easier to understand DB evolution
```

---

## 🚨 IF MIGRATION FAILS

### Step 1: Check Status
```bash
npx prisma migrate status
```
Output will show:
- Pending migrations
- Failed migrations
- Applied migrations

### Step 2: Read Error Message Carefully
```bash
# Error message will tell you:
# - What SQL syntax is wrong
# - What constraint violation occurred
# - What foreign key issue exists
```

### Step 3: Resolve Issue

**Option A: Fix and Retry** (if schema error)
```bash
# 1. Fix schema.prisma
# 2. Run:
npx prisma migrate dev --name fix_issue
```

**Option B: Rollback Failed Migration**
```bash
npx prisma migrate resolve --rolled-back 20260526_migration_name

# Then fix and recreate
npx prisma migrate dev --name fixed_version
```

**Option C: Reset (Development Only!)**
```bash
# ⚠️ LOSES ALL DATA!
npx prisma migrate reset --force

# Then recreate manually
```

---

## 📝 CLEAN WORKFLOW SUMMARY

### Development Workflow:
```
1. Plan your schema change
   ↓
2. Modify schema.prisma
   ↓
3. Run: npx prisma migrate dev --name clear_descriptive_name
   ↓
4. Test locally with API/frontend
   ↓
5. Run: git add . && git commit -m "Add [feature] migration"
   ↓
6. Push to repository
   ↓
7. Teammates pull and run: npx prisma migrate deploy
   ↓
8. ✅ Done! Everyone has same schema
```

### Production Workflow:
```
1. Migrations already tested in development/staging
   ↓
2. Deploy code changes to production
   ↓
3. Run: npx prisma migrate deploy
   ↓
4. Monitor for any issues
   ↓
5. ✅ Production is updated
```

---

## 💾 IMPORTANT COMMANDS REFERENCE

### For Development:
```bash
# Create and apply migration
npx prisma migrate dev --name migration_name

# Create migration without applying (if DB not ready)
npx prisma migrate resolve --rolled-back

# Check status
npx prisma migrate status

# Reset everything (careful!)
npx prisma migrate reset --force

# Generate Prisma Client (after manual DB changes)
npx prisma generate
```

### For Production/Staging:
```bash
# Apply pending migrations only
npx prisma migrate deploy

# Check what's pending
npx prisma migrate status

# Never use:
# - npx prisma migrate dev
# - npx prisma migrate reset
```

---

## ✅ BEST PRACTICES CHECKLIST

- [ ] Always use `migrate dev` for changes, never manual DB edits
- [ ] Give migrations clear, descriptive names
- [ ] Test migrations locally before pushing
- [ ] Commit migrations to Git
- [ ] Never modify migrations after applying
- [ ] Use `migrate deploy` in production only
- [ ] Keep migration history clean and readable
- [ ] Handle data migrations separately (fill existing rows)
- [ ] Add indexes for commonly filtered columns
- [ ] Document complex migrations
- [ ] Review migration SQL before applying
- [ ] Have database backups before applying in production

---

## 🎯 KEY TAKEAWAY

**The Golden Rule:**
```
Schema Change → npx prisma migrate dev → Commit → Deploy
```

**Never:**
```
Manual DB change → npx prisma generate → Commit
```

This avoids schema drift and migration headaches!

---

## 📚 HELPFUL RESOURCES

- Prisma Docs: https://www.prisma.io/docs/concepts/components/prisma-migrate
- Best Practices: https://www.prisma.io/docs/guides/database/develop-and-prototype
- Troubleshooting: https://www.prisma.io/docs/guides/database/troubleshooting-orm

---

**Last Updated:** May 26, 2026
**Version:** 1.0
