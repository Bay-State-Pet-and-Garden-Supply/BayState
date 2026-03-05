import { createPet, deletePet, getPetById, getPetTypes, getUserPets, updatePet } from '@/lib/account/pets'
import { createClient } from '@/lib/supabase/server'

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn()
}))

// Mock next/cache
jest.mock('next/cache', () => ({
    revalidatePath: jest.fn()
}))

describe('Pet Management', () => {
    const mockSupabase = {
        from: jest.fn(),
        auth: {
            getUser: jest.fn()
        }
    }

    beforeEach(() => {
        jest.clearAllMocks();
        (createClient as jest.Mock).mockResolvedValue(mockSupabase)
    })

    describe('getPetTypes', () => {
        it('should return pet types ordered by display_order', async () => {
            const mockData = [
                { id: '1', name: 'Dog', display_order: 1 },
                { id: '2', name: 'Cat', display_order: 2 }
            ]

            mockSupabase.from.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    order: jest.fn().mockResolvedValue({ data: mockData, error: null })
                })
            })

            const result = await getPetTypes()
            expect(result).toEqual(mockData)
            expect(mockSupabase.from).toHaveBeenCalledWith('pet_types')
        })

        it('should return empty array on error', async () => {
            mockSupabase.from.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    order: jest.fn().mockResolvedValue({ data: null, error: 'Error' })
                })
            })

            const result = await getPetTypes()
            expect(result).toEqual([])
        })
    })

    describe('createPet', () => {
        it('should create a pet for authenticated user', async () => {
            const mockUser = { id: 'user-123' }
            mockSupabase.auth.getUser.mockResolvedValue({ data: { user: mockUser } })

            const insertMock = jest.fn().mockResolvedValue({ error: null })
            mockSupabase.from.mockReturnValue({
                insert: insertMock
            })

            const petData = { name: 'Max', pet_type_id: 'type-1' }
            const result = await createPet(petData)

            expect(result).toEqual({ success: true })
            expect(insertMock).toHaveBeenCalledWith({
                ...petData,
                user_id: mockUser.id
            })
        })

        it('should throw error if user not authenticated', async () => {
            mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } })

            await expect(createPet({ name: 'Max' }))
                .rejects.toThrow('Not authenticated')
        })
    })

    describe('getUserPets', () => {
        it('should fetch pets with type relation', async () => {
            const mockPets = [
                { id: 'pet-1', name: 'Max', pet_type: { name: 'Dog' } }
            ]

            mockSupabase.from.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    order: jest.fn().mockResolvedValue({ data: mockPets, error: null })
                })
            })

            const result = await getUserPets()
            expect(result).toEqual(mockPets)
        })
    })
})
