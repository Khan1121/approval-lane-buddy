-- Drop the existing trigger first
DROP TRIGGER IF EXISTS update_queue_positions_trigger ON public.approval_requests;

-- Drop and recreate the function with proper recursion prevention
DROP FUNCTION IF EXISTS public.update_queue_positions();

CREATE OR REPLACE FUNCTION public.update_queue_positions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only update queue positions if the status changed to/from pending
  -- and avoid recursion by checking if queue_position is already being updated
  IF (TG_OP = 'UPDATE' AND 
      (OLD.status IS DISTINCT FROM NEW.status OR OLD.queue_position IS DISTINCT FROM NEW.queue_position) AND
      (OLD.status = 'pending' OR NEW.status = 'pending')) OR
     (TG_OP = 'INSERT' AND NEW.status = 'pending') THEN
    
    -- Update queue positions for pending requests, but exclude the current row if it's an update
    WITH ranked_requests AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as new_position
      FROM public.approval_requests
      WHERE status = 'pending'
        AND (TG_OP = 'INSERT' OR id != NEW.id)
    )
    UPDATE public.approval_requests
    SET queue_position = ranked_requests.new_position
    FROM ranked_requests
    WHERE approval_requests.id = ranked_requests.id
      AND approval_requests.queue_position IS DISTINCT FROM ranked_requests.new_position;
      
    -- Set queue position for the current row if it's pending
    IF NEW.status = 'pending' THEN
      NEW.queue_position = (
        SELECT COUNT(*) + 1
        FROM public.approval_requests
        WHERE status = 'pending' 
          AND created_at < NEW.created_at
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger only for INSERT and specific UPDATE cases
CREATE TRIGGER update_queue_positions_trigger
  BEFORE INSERT OR UPDATE OF status ON public.approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_queue_positions();