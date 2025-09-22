-- Fix remaining functions with search_path
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.update_queue_positions() CASCADE;

-- Recreate handle_new_user with proper search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, department, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', 'Unknown'),
    COALESCE(NEW.raw_user_meta_data ->> 'department', 'General'),
    'employee'
  );
  RETURN NEW;
END;
$$;

-- Recreate update_queue_positions with proper search_path
CREATE OR REPLACE FUNCTION public.update_queue_positions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update queue positions for pending requests
  WITH ranked_requests AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as new_position
    FROM public.approval_requests
    WHERE status = 'pending'
  )
  UPDATE public.approval_requests
  SET queue_position = ranked_requests.new_position
  FROM ranked_requests
  WHERE approval_requests.id = ranked_requests.id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Recreate triggers
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER update_queue_positions_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.approval_requests
  FOR EACH STATEMENT EXECUTE FUNCTION public.update_queue_positions();