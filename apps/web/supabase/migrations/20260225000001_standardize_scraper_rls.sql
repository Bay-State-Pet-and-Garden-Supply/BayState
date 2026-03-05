-- ============================================================================
-- STANDARDIZE: Scraper Table RLS Policies
-- Created: 2026-02-25
-- ============================================================================
-- This migration standardizes RLS policies across all scraper tables to use
-- the consistent admin/staff pattern. This ensures proper access control.
-- ============================================================================

-- =============================================================================
-- STEP 1: Fix scrape_jobs UPDATE policy
-- The current policy uses USING (true) which allows ALL authenticated users
-- to update any job. We need to restrict to admin/staff + service_role.
-- =============================================================================

-- First, drop the overly permissive update policy
DROP POLICY IF EXISTS "Service role can update scrape jobs" ON public.scrape_jobs;

-- Create properly restricted update policy for admin/staff
CREATE POLICY "Admin and staff can update scrape jobs"
    ON public.scrape_jobs
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

-- Service role can still update (for GitHub Actions runners)
CREATE POLICY "Service role can update scrape jobs"
    ON public.scrape_jobs
    FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =============================================================================
-- STEP 2: Fix scrape_results INSERT policy  
-- The current policy uses WITH CHECK (true) which allows any authenticated user
-- =============================================================================

-- Drop the overly permissive insert policy
DROP POLICY IF EXISTS "Service role can insert scrape results" ON public.scrape_results;

-- Create properly restricted insert policy for admin/staff
CREATE POLICY "Admin and staff can insert scrape results"
    ON public.scrape_results
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

-- Service role can still insert (for GitHub Actions runners)
CREATE POLICY "Service role can insert scrape results"
    ON public.scrape_results
    FOR INSERT
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =============================================================================
-- STEP 3: Fix scraper_config_versions policies  
-- The current policy may have overly permissive insert/update
-- =============================================================================

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can create scraper config versions" ON public.scraper_config_versions;
DROP POLICY IF EXISTS "Staff can update scraper config versions" ON public.scraper_config_versions;

-- SELECT: Admin/Staff can view all versions
CREATE POLICY "Admin and staff can view scraper config versions"
    ON public.scraper_config_versions
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

-- INSERT: Admin/Staff can create versions
CREATE POLICY "Admin and staff can create scraper config versions"
    ON public.scraper_config_versions
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

-- UPDATE: Admin/Staff can update versions
CREATE POLICY "Admin and staff can update scraper config versions"
    ON public.scraper_config_versions
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

-- DELETE: Admin only can delete versions
CREATE POLICY "Admins can delete scraper config versions"
    ON public.scraper_config_versions
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Service role has full access
CREATE POLICY "Service role can manage scraper config versions"
    ON public.scraper_config_versions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =============================================================================
-- STEP 4: Fix scraper_test_run_steps policies
-- =============================================================================

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Service role can manage test run steps" ON public.scraper_test_run_steps;

-- SELECT: Admin/Staff can view
CREATE POLICY "Admin and staff can view test run steps"
    ON public.scraper_test_run_steps
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

-- INSERT: Admin/Staff can create
CREATE POLICY "Admin and staff can create test run steps"
    ON public.scraper_test_run_steps
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

-- UPDATE: Admin/Staff can update
CREATE POLICY "Admin and staff can update test run steps"
    ON public.scraper_test_run_steps
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'staff')
        )
    );

-- DELETE: Admin only
CREATE POLICY "Admins can delete test run steps"
    ON public.scraper_test_run_steps
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Service role has full access
CREATE POLICY "Service role can manage test run steps"
    ON public.scraper_test_run_steps
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =============================================================================
-- STEP 5: Fix scraper_test_runs policies (add if missing)
-- =============================================================================

-- Check if policies exist, if not create them
-- SELECT
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE policyname = 'Admin and staff can view test runs' 
        AND tablename = 'scraper_test_runs'
    ) THEN
        CREATE POLICY "Admin and staff can view test runs"
            ON public.scraper_test_runs
            FOR SELECT
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role IN ('admin', 'staff')
                )
            );
    END IF;
END
$$;

-- INSERT
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE policyname = 'Admin and staff can create test runs' 
        AND tablename = 'scraper_test_runs'
    ) THEN
        CREATE POLICY "Admin and staff can create test runs"
            ON public.scraper_test_runs
            FOR INSERT
            TO authenticated
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role IN ('admin', 'staff')
                )
            );
    END IF;
END
$$;

-- UPDATE
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE policyname = 'Admin and staff can update test runs' 
        AND tablename = 'scraper_test_runs'
    ) THEN
        CREATE POLICY "Admin and staff can update test runs"
            ON public.scraper_test_runs
            FOR UPDATE
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role IN ('admin', 'staff')
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role IN ('admin', 'staff')
                )
            );
    END IF;
END
$$;

-- DELETE (admin only)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE policyname = 'Admins can delete test runs' 
        AND tablename = 'scraper_test_runs'
    ) THEN
        CREATE POLICY "Admins can delete test runs"
            ON public.scraper_test_runs
            FOR DELETE
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role = 'admin'
                )
            );
    END IF;
END
$$;

-- Service role full access
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE policyname = 'Service role can manage test runs' 
        AND tablename = 'scraper_test_runs'
    ) THEN
        CREATE POLICY "Service role can manage test runs"
            ON public.scraper_test_runs
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END
$$;

-- =============================================================================
-- STEP 6: Fix selector_suggestions policies (add if missing)
-- =============================================================================

-- SELECT
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE policyname = 'Admin and staff can view selector suggestions' 
        AND tablename = 'selector_suggestions'
    ) THEN
        CREATE POLICY "Admin and staff can view selector suggestions"
            ON public.selector_suggestions
            FOR SELECT
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role IN ('admin', 'staff')
                )
            );
    END IF;
END
$$;

-- INSERT
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE policyname = 'Admin and staff can create selector suggestions' 
        AND tablename = 'selector_suggestions'
    ) THEN
        CREATE POLICY "Admin and staff can create selector suggestions"
            ON public.selector_suggestions
            FOR INSERT
            TO authenticated
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role IN ('admin', 'staff')
                )
            );
    END IF;
END
$$;

-- UPDATE
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE policyname = 'Admin and staff can update selector suggestions' 
        AND tablename = 'selector_suggestions'
    ) THEN
        CREATE POLICY "Admin and staff can update selector suggestions"
            ON public.selector_suggestions
            FOR UPDATE
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role IN ('admin', 'staff')
                )
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role IN ('admin', 'staff')
                )
            );
    END IF;
END
$$;

-- DELETE (admin only)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE policyname = 'Admins can delete selector suggestions' 
        AND tablename = 'selector_suggestions'
    ) THEN
        CREATE POLICY "Admins can delete selector suggestions"
            ON public.selector_suggestions
            FOR DELETE
            TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role = 'admin'
                )
            );
    END IF;
END
$$;

-- Service role full access
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE policyname = 'Service role can manage selector suggestions' 
        AND tablename = 'selector_suggestions'
    ) THEN
        CREATE POLICY "Service role can manage selector suggestions"
            ON public.selector_suggestions
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END
$$;
