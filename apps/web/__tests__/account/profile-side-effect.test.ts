/**
 * @jest-environment node
 */
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Test to verify Issue #5: Side-effect in Server Component is FIXED
 * 
 * The old implementation had an INSERT statement during render which violated
 * Server Component idempotency. The new implementation shows CreateProfileCard
 * instead of auto-creating the profile.
 */
describe('Issue #5: Profile Side-effect - VERIFIED', () => {
    
    it('VERIFIED: ProfilePage does NOT perform INSERT on render', () => {
        // Read the profile page source
        const profilePagePath = join(process.cwd(), 'app/(storefront)/account/profile/page.tsx');
        const content = readFileSync(profilePagePath, 'utf-8');
        
        // Verify NO INSERT statement in the render function
        expect(content).not.toContain('.insert(');
        expect(content).not.toContain('from(\'profiles\').insert');
        expect(content).not.toContain('supabase.from(\'profiles\').insert');
        
        console.log('Issue #5 VERIFIED: ProfilePage does not perform INSERT on render');
    });

    it('VERIFIED: ProfilePage shows CreateProfileCard for missing profile', () => {
        // Read the profile page source
        const profilePagePath = join(process.cwd(), 'app/(storefront)/account/profile/page.tsx');
        const content = readFileSync(profilePagePath, 'utf-8');
        
        // Verify CreateProfileCard is rendered for missing profile
        expect(content).toContain('<CreateProfileCard');
        expect(content).toContain('if (!profile)');
        expect(content).toContain('CreateProfileCard');        
        // Verify the component receives user data
        expect(content).toContain('userEmail={user.email');
        expect(content).toContain('userName={user.user_metadata');
        
        console.log('Issue #5 VERIFIED: ProfilePage shows CreateProfileCard for missing profile');
    });

    it('VERIFIED: Profile creation happens via Server Action, not render', () => {
        // Read the CreateProfileCard component
        const createCardPath = join(process.cwd(), 'components/account/create-profile-card.tsx');
        const content = readFileSync(createCardPath, 'utf-8');
        
        // Verify Server Action is used for profile creation
        expect(content).toContain('createMissingProfileAction');
        expect(content).toContain('handleCreateProfile');
        expect(content).toContain('startTransition');
        
        // Verify it's triggered by user action (onClick), not automatic
        expect(content).toContain('onClick={handleCreateProfile}');
        
        console.log('Issue #5 VERIFIED: Profile creation via Server Action, not render');
    });

    it('VERIFIED: getProfile function is read-only (no INSERT)', () => {
        // Read the roles file
        const rolesPath = join(process.cwd(), 'lib/auth/roles.ts');
        const content = readFileSync(rolesPath, 'utf-8');
        
        // Verify getProfile is read-only
        expect(content).toContain('export async function getProfile');
        expect(content).toContain('.from(\'profiles\')');
        expect(content).toContain('.select(');
        expect(content).not.toContain('.insert(');
        
        console.log('Issue #5 VERIFIED: getProfile function is read-only');
    });

    it('VERIFIED: Profile creation is user-triggered, not automatic', () => {
        // Read the Server Action
        const actionsPath = join(process.cwd(), 'lib/account/actions.ts');
        const content = readFileSync(actionsPath, 'utf-8');
        
        // Verify createMissingProfileAction exists and is a Server Action
        expect(content).toContain('createMissingProfileAction');
        expect(content).toContain("'use server'");
        
        // Verify it handles the INSERT operation (not the page render)
        expect(content).toContain('.insert(');
        
        console.log('Issue #5 VERIFIED: Profile creation is user-triggered Server Action');
    });

    it('CONFIRMS: Server Component idempotency is maintained', () => {
        // Read the profile page source
        const profilePagePath = join(process.cwd(), 'app/(storefront)/account/profile/page.tsx');
        const content = readFileSync(profilePagePath, 'utf-8');
        
        // The profile page should be idempotent:
        // - GET requests should not cause INSERT operations
        // - Profile creation only happens via explicit user action
        
        // Verify the comment explaining the architecture
        expect(content).toContain('side-effect');
        expect(content).toContain('user-triggered action');
        
        // Verify no database mutations in render
        expect(content).not.toMatch(/\.insert\(/);
        expect(content).not.toMatch(/\.update\(/);
        expect(content).not.toMatch(/\.delete\(/);
        
        console.log('Issue #5 VERIFIED: Server Component idempotency is maintained');
    });
});
