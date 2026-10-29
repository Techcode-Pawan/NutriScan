-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "InrClass" AS ENUM ('SOLID', 'LIQUID', 'EXEMPT');

-- CreateEnum
CREATE TYPE "NutritionBasis" AS ENUM ('PER_100G', 'PER_100ML', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('OPEN_FOOD_FACTS', 'LEGACY_CSV', 'USER_SUBMISSION');

-- CreateEnum
CREATE TYPE "InrStatus" AS ENUM ('RATED', 'PARTIAL', 'INSUFFICIENT_DATA', 'EXEMPT', 'NOT_ELIGIBLE', 'BASIS_UNKNOWN');

-- CreateEnum
CREATE TYPE "ScanMethod" AS ENUM ('CAMERA', 'MANUAL', 'IMAGE', 'SEARCH');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SubmissionSource" AS ENUM ('MANUAL', 'OCR');

-- CreateEnum
CREATE TYPE "AgeGroup" AS ENUM ('CHILD', 'TEEN', 'ADULT', 'SENIOR');

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inr_class" "InrClass",
    "is_beverage" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "parent_id" INTEGER,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "barcode" VARCHAR(14),
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category_id" INTEGER,
    "subcategory" TEXT,
    "ingredients_text" TEXT,
    "image_url" TEXT,
    "quantity" TEXT,
    "is_vegetarian" BOOLEAN,
    "data_source" "DataSource" NOT NULL,
    "source_ref" TEXT NOT NULL,
    "source_modified_at" TIMESTAMP(3),
    "quality_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reference_labels" JSONB,
    "import_batch_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition_facts" (
    "product_id" TEXT NOT NULL,
    "basis" "NutritionBasis" NOT NULL,
    "basis_note" TEXT,
    "energy_kcal" DECIMAL(7,2),
    "fat_g" DECIMAL(6,2),
    "saturated_fat_g" DECIMAL(6,2),
    "trans_fat_g" DECIMAL(6,2),
    "carbohydrates_g" DECIMAL(6,2),
    "sugars_g" DECIMAL(6,2),
    "fiber_g" DECIMAL(6,2),
    "protein_g" DECIMAL(6,2),
    "sodium_mg" DECIMAL(9,2),
    "fruit_veg_pct" DECIMAL(5,2),
    "nuts_legumes_millets_pct" DECIMAL(5,2),
    "completeness" DOUBLE PRECISION NOT NULL,
    "extra" JSONB,

    CONSTRAINT "nutrition_facts_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "health_scores" (
    "id" SERIAL NOT NULL,
    "product_id" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'INR',
    "algorithm_version" TEXT NOT NULL,
    "status" "InrStatus" NOT NULL,
    "inr_class" "InrClass",
    "star_rating" DECIMAL(2,1),
    "final_score" INTEGER,
    "baseline_points" INTEGER,
    "positive_points" INTEGER,
    "breakdown" JSONB NOT NULL,
    "explanation" JSONB NOT NULL,
    "data_completeness" DOUBLE PRECISION NOT NULL,
    "is_hfss" BOOLEAN,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_thresholds" (
    "id" SERIAL NOT NULL,
    "algorithm_version" TEXT NOT NULL,
    "inr_class" "InrClass" NOT NULL,
    "parameter" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "greater_than" DECIMAL(9,2) NOT NULL,

    CONSTRAINT "category_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_algorithms" (
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "assumptions" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scoring_algorithms_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "user_id" UUID NOT NULL,
    "low_sugar" BOOLEAN NOT NULL DEFAULT false,
    "low_sodium" BOOLEAN NOT NULL DEFAULT false,
    "low_saturated_fat" BOOLEAN NOT NULL DEFAULT false,
    "high_fiber" BOOLEAN NOT NULL DEFAULT false,
    "high_protein" BOOLEAN NOT NULL DEFAULT false,
    "vegetarian" BOOLEAN NOT NULL DEFAULT false,
    "excluded_ingredients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "age_group" "AgeGroup",
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "scan_history" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "product_id" TEXT NOT NULL,
    "method" "ScanMethod" NOT NULL DEFAULT 'MANUAL',
    "scanned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "user_id" UUID NOT NULL,
    "product_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("user_id","product_id")
);

-- CreateTable
CREATE TABLE "product_submissions" (
    "id" SERIAL NOT NULL,
    "user_id" UUID,
    "barcode" VARCHAR(14),
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "source" "SubmissionSource" NOT NULL DEFAULT 'MANUAL',
    "payload" JSONB NOT NULL,
    "image_path" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewer_note" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "product_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "stats" JSONB,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ml_model_versions" (
    "version" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "config" JSONB NOT NULL,
    "trained_at" TIMESTAMP(3) NOT NULL,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ml_model_versions_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "ml_predictions" (
    "id" SERIAL NOT NULL,
    "product_id" TEXT NOT NULL,
    "model_version" TEXT NOT NULL,
    "predicted_grade" TEXT NOT NULL,
    "ml_index" DOUBLE PRECISION NOT NULL,
    "probabilities" JSONB NOT NULL,
    "explanation" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ml_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_queries" (
    "id" SERIAL NOT NULL,
    "user_id" UUID,
    "product_id" TEXT,
    "intent" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_queries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "products_source_ref_key" ON "products"("source_ref");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_brand_idx" ON "products"("brand");

-- CreateIndex
CREATE INDEX "products_data_source_idx" ON "products"("data_source");

-- CreateIndex
CREATE INDEX "nutrition_facts_sugars_g_idx" ON "nutrition_facts"("sugars_g");

-- CreateIndex
CREATE INDEX "nutrition_facts_sodium_mg_idx" ON "nutrition_facts"("sodium_mg");

-- CreateIndex
CREATE UNIQUE INDEX "health_scores_product_id_key" ON "health_scores"("product_id");

-- CreateIndex
CREATE INDEX "health_scores_star_rating_idx" ON "health_scores"("star_rating" DESC);

-- CreateIndex
CREATE INDEX "health_scores_status_idx" ON "health_scores"("status");

-- CreateIndex
CREATE UNIQUE INDEX "category_thresholds_algorithm_version_inr_class_parameter_p_key" ON "category_thresholds"("algorithm_version", "inr_class", "parameter", "points");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "scan_history_user_id_scanned_at_idx" ON "scan_history"("user_id", "scanned_at" DESC);

-- CreateIndex
CREATE INDEX "product_submissions_status_idx" ON "product_submissions"("status");

-- CreateIndex
CREATE INDEX "product_submissions_barcode_idx" ON "product_submissions"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "ml_predictions_product_id_model_version_key" ON "ml_predictions"("product_id", "model_version");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition_facts" ADD CONSTRAINT "nutrition_facts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_scores" ADD CONSTRAINT "health_scores_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_history" ADD CONSTRAINT "scan_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_history" ADD CONSTRAINT "scan_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_submissions" ADD CONSTRAINT "product_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml_predictions" ADD CONSTRAINT "ml_predictions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml_predictions" ADD CONSTRAINT "ml_predictions_model_version_fkey" FOREIGN KEY ("model_version") REFERENCES "ml_model_versions"("version") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_queries" ADD CONSTRAINT "assistant_queries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Trigram indexes for case-insensitive product-name and brand search (thesis Appendix A).
CREATE INDEX "idx_products_name_trgm" ON "products" USING gin ("name" gin_trgm_ops);
CREATE INDEX "idx_products_brand_trgm" ON "products" USING gin ("brand" gin_trgm_ops);

-- Plausibility constraints on nutrition values (thesis Table 3.2, step 4).
ALTER TABLE "nutrition_facts" ADD CONSTRAINT "nutrition_non_negative" CHECK (
  coalesce("energy_kcal", 0) >= 0 AND coalesce("fat_g", 0) >= 0 AND coalesce("saturated_fat_g", 0) >= 0 AND
  coalesce("carbohydrates_g", 0) >= 0 AND coalesce("sugars_g", 0) >= 0 AND coalesce("fiber_g", 0) >= 0 AND
  coalesce("protein_g", 0) >= 0 AND coalesce("sodium_mg", 0) >= 0
);
ALTER TABLE "nutrition_facts" ADD CONSTRAINT "nutrition_energy_max" CHECK ("energy_kcal" IS NULL OR "energy_kcal" <= 900);
ALTER TABLE "health_scores" ADD CONSTRAINT "star_rating_range" CHECK ("star_rating" IS NULL OR ("star_rating" >= 0.5 AND "star_rating" <= 5));
