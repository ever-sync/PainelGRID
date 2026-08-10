UPDATE "events"
SET
  "allow_reception_create_sale" = false,
  "allow_reception_edit_sale" = false,
  "allow_reception_delete_sale" = false
WHERE
  "allow_reception_create_sale" = true
  OR "allow_reception_edit_sale" = true
  OR "allow_reception_delete_sale" = true;
