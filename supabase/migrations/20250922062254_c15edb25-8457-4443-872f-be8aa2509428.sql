-- Create profiles table for user information
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee', -- 'employee', 'approver', 'admin'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create approval_requests table
CREATE TABLE public.approval_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  department TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  queue_position INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create approval_actions table for tracking approval history
CREATE TABLE public.approval_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'approved', 'rejected'
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (true);

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = id);

-- RLS Policies for approval_requests
CREATE POLICY "Anyone can view approval requests" 
ON public.approval_requests 
FOR SELECT 
USING (true);

CREATE POLICY "Users can create their own requests" 
ON public.approval_requests 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own requests" 
ON public.approval_requests 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Approvers can update request status" 
ON public.approval_requests 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE id = auth.uid() AND role IN ('approver', 'admin')
));

-- RLS Policies for approval_actions
CREATE POLICY "Anyone can view approval actions" 
ON public.approval_actions 
FOR SELECT 
USING (true);

CREATE POLICY "Approvers can create approval actions" 
ON public.approval_actions 
FOR INSERT 
WITH CHECK (
  auth.uid() = approver_id AND 
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('approver', 'admin')
  )
);

-- Function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
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

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update queue positions
CREATE OR REPLACE FUNCTION public.update_queue_positions()
RETURNS TRIGGER
LANGUAGE plpgsql
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

-- Trigger to update queue positions
CREATE TRIGGER update_queue_positions_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.approval_requests
  FOR EACH STATEMENT EXECUTE FUNCTION public.update_queue_positions();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_approval_requests_updated_at
  BEFORE UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();