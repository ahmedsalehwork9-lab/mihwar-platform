CREATE OR REPLACE FUNCTION public.approve_order(p_order_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_product_qty numeric;
  v_buyer_prod RECORD;
  v_is_partial boolean := false;
BEGIN

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطلب غير موجود';
  END IF;

  IF v_order.status IN ('completed', 'partial_completed') THEN
    RETURN;
  END IF;

  IF v_order.status = 'rejected' THEN
    RAISE EXCEPTION 'لا يمكن اعتماد طلب مرفوض';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.order_items
    WHERE order_id = p_order_id
      AND COALESCE(approved_quantity, 0) < quantity
  )
  INTO v_is_partial;

  FOR v_item IN
    SELECT
      oi.id,
      oi.product_id,
      oi.quantity,
      oi.price,
      COALESCE(oi.approved_quantity, 0) AS approved_quantity,
      p.product_code,
      p.product_name,
      p.brand,
      p.model
    FROM public.order_items oi
    JOIN public.products p
      ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id
  LOOP

    IF v_item.approved_quantity <= 0 THEN
      CONTINUE;
    END IF;

    SELECT quantity
    INTO v_product_qty
    FROM public.products
    WHERE id = v_item.product_id
      AND shop_id = v_order.to_shop_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'المنتج % غير موجود عند المورد',
        v_item.product_name;
    END IF;

    IF v_product_qty < v_item.approved_quantity THEN
      RAISE EXCEPTION
        'الكمية المتوفرة للمنتج % (% ) أقل من الكمية المعتمدة (%)',
        v_item.product_name,
        v_product_qty,
        v_item.approved_quantity;
    END IF;

    UPDATE public.products
    SET quantity = quantity - v_item.approved_quantity
    WHERE id = v_item.product_id
      AND shop_id = v_order.to_shop_id;

    SELECT *
    INTO v_buyer_prod
    FROM public.products
    WHERE product_code = v_item.product_code
      AND shop_id = v_order.from_shop_id
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.products
      SET quantity = quantity + v_item.approved_quantity
      WHERE id = v_buyer_prod.id;
    ELSE
      INSERT INTO public.products (
        shop_id,
        product_code,
        product_name,
        brand,
        model,
        price,
        quantity
      )
      VALUES (
        v_order.from_shop_id,
        v_item.product_code,
        v_item.product_name,
        v_item.brand,
        v_item.model,
        v_item.price,
        v_item.approved_quantity
      );
    END IF;

  END LOOP;

  UPDATE public.orders
  SET
    status = CASE
      WHEN v_is_partial THEN 'partial_completed'
      ELSE 'completed'
    END,
    approved_at = now()
  WHERE id = p_order_id;

END;
$function$;