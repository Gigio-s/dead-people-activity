-- Apply once to the SAME D1 used by both checkouts, after taking a D1 export.
-- Additive migration: products/orders are not replaced.
CREATE TABLE IF NOT EXISTS market_events (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,
 operation_id TEXT NOT NULL UNIQUE,
 product_id TEXT NOT NULL REFERENCES products(id),
 delta INTEGER NOT NULL CHECK(delta IN (-1,1)),
 undo_of TEXT UNIQUE REFERENCES market_events(operation_id),
 price_cents INTEGER NOT NULL CHECK(price_cents>=0),
 actor TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK((delta=-1 AND undo_of IS NULL) OR (delta=1 AND undo_of IS NOT NULL))
);
CREATE TRIGGER IF NOT EXISTS market_event_validate BEFORE INSERT ON market_events
BEGIN
 SELECT CASE WHEN NEW.delta=-1 AND NOT EXISTS(
   SELECT 1 FROM products WHERE id=NEW.product_id AND stock-reserved>=1)
   THEN RAISE(ABORT,'Copia non disponibile o prenotata online') END;
 SELECT CASE WHEN NEW.delta=1 AND NOT EXISTS(
   SELECT 1 FROM market_events WHERE operation_id=NEW.undo_of AND delta=-1
     AND product_id=NEW.product_id AND price_cents=NEW.price_cents)
   THEN RAISE(ABORT,'Vendita originale non valida') END;
END;
CREATE TRIGGER IF NOT EXISTS market_event_stock AFTER INSERT ON market_events
BEGIN
 UPDATE products SET stock=stock+NEW.delta,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.product_id;
END;
