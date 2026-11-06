CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerProjectId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");
CREATE UNIQUE INDEX "Project_providerProjectId_key" ON "Project"("providerProjectId");

CREATE TABLE "SearchIntent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "schedule" TEXT NOT NULL DEFAULT 'ANY',
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "goal" TEXT,
    "confirmedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SearchIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SearchIntent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SearchIntent_userId_scopeKey_purpose_key" ON "SearchIntent"("userId", "scopeKey", "purpose");
CREATE INDEX "SearchIntent_userId_active_expiresAt_idx" ON "SearchIntent"("userId", "active", "expiresAt");
CREATE INDEX "SearchIntent_purpose_scopeKey_active_expiresAt_idx" ON "SearchIntent"("purpose", "scopeKey", "active", "expiresAt");
