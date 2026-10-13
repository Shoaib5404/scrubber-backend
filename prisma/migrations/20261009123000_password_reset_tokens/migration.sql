-- CreateTable
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "email" VARCHAR(255) NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("email")
);
