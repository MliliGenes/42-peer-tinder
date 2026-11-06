CREATE TABLE "OAuthAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL DEFAULT 'FORTYTWO',
    "purpose" TEXT NOT NULL DEFAULT 'LOGIN',
    "stateHash" TEXT NOT NULL,
    "browserNonceHash" TEXT NOT NULL,
    "returnPath" TEXT NOT NULL DEFAULT '/',
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "OAuthAttempt_stateHash_key" ON "OAuthAttempt"("stateHash");
CREATE INDEX "OAuthAttempt_expiresAt_idx" ON "OAuthAttempt"("expiresAt");
CREATE INDEX "OAuthAttempt_provider_purpose_consumedAt_idx" ON "OAuthAttempt"("provider", "purpose", "consumedAt");
