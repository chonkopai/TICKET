ALTER TABLE "ChatMessage" ADD COLUMN "orderId" UUID;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ChatMessage_orderId_createdAt_id_idx" ON "ChatMessage"("orderId", "createdAt", "id");
