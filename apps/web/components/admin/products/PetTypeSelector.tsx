'use client';

import { useState, useEffect } from 'react';
import { Dog, Cat, Bird, Fish, Rabbit, Bug } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface PetType {
  id: string;
  name: string;
}

interface ProductPetType {
  pet_type_id: string;
}

interface PetTypeSelectorProps {
  selectedPetTypes: ProductPetType[];
  onChange: (petTypes: ProductPetType[]) => void;
}

const petTypeIcons: Record<string, React.ElementType> = {
  'Dog': Dog,
  'Cat': Cat,
  'Bird': Bird,
  'Fish': Fish,
  'Small Animal': Rabbit,
  'Reptile': Bug,
};

export function PetTypeSelector({ selectedPetTypes, onChange }: PetTypeSelectorProps) {
  const [petTypes, setPetTypes] = useState<PetType[]>([]);
  const [loading, setLoading] = useState(true);
  const isSelected = (petTypeId: string) =>
    selectedPetTypes.some((petType) => petType.pet_type_id === petTypeId);

  useEffect(() => {
    async function fetchPetTypes() {
      try {
        const res = await fetch('/api/admin/pet-types');
        if (res.ok) {
          const data = await res.json();
          setPetTypes(data.petTypes || []);
        }
      } catch (err) {
        console.error('Failed to fetch pet types:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchPetTypes();
  }, []);

  const handleToggle = (petTypeId: string, checked: boolean) => {
    if (checked) {
      onChange([
        ...selectedPetTypes,
        { pet_type_id: petTypeId },
      ]);
    } else {
      onChange(selectedPetTypes.filter((pt) => pt.pet_type_id !== petTypeId));
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <Label>Pet Types</Label>
        <div className="text-sm text-muted-foreground animate-pulse">Loading pet types…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Label className="text-sm font-semibold tracking-tight">Pet Types</Label>
      <div className="grid grid-cols-2 gap-2">
        {petTypes.map((petType) => {
          const IconComponent = petTypeIcons[petType.name] || Dog;
          const selected = isSelected(petType.id);

          return (
            <div
              key={petType.id}
              className={cn(
                "flex items-center gap-2 rounded-lg border p-2 transition-all duration-200",
                selected 
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20" 
                  : "border-border hover:bg-muted/50"
              )}
            >
              <Checkbox
                id={`pet-type-${petType.id}`}
                checked={selected}
                onCheckedChange={(checked) => handleToggle(petType.id, checked === true)}
                className="size-4"
              />
              <div className="flex size-5 items-center justify-center text-muted-foreground">
                <IconComponent className="size-full" />
              </div>
              <Label
                htmlFor={`pet-type-${petType.id}`}
                className="flex-1 cursor-pointer text-xs font-medium"
              >
                {petType.name}
              </Label>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground italic">
        Select which pet types this product is suitable for.
      </p>
    </div>
  );
}
