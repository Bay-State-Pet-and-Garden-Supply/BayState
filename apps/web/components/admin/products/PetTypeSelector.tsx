'use client';

import { useState, useEffect } from 'react';
import { Dog, Cat, Bird, Fish, Rabbit, Bug } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface PetType {
  id: string;
  name: string;
}

interface ProductPetType {
  pet_type_id: string;
  confidence: 'inferred' | 'manual' | 'verified';
}

interface PetTypeSelectorProps {
  productId: string;
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

  const isSelected = (petTypeId: string) => {
    return selectedPetTypes.some((pt) => pt.pet_type_id === petTypeId);
  };

  const getConfidence = (petTypeId: string): 'inferred' | 'manual' | 'verified' | null => {
    const pt = selectedPetTypes.find((pt) => pt.pet_type_id === petTypeId);
    return pt?.confidence || null;
  };

  const handleToggle = (petTypeId: string, checked: boolean) => {
    if (checked) {
      onChange([
        ...selectedPetTypes,
        { pet_type_id: petTypeId, confidence: 'manual' },
      ]);
    } else {
      onChange(selectedPetTypes.filter((pt) => pt.pet_type_id !== petTypeId));
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Label>Pet Types</Label>
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Pet Types</Label>
      <div className="grid grid-cols-2 gap-2">
        {petTypes.map((petType) => {
          const IconComponent = petTypeIcons[petType.name] || Dog;
          const selected = isSelected(petType.id);
          const confidence = getConfidence(petType.id);

          return (
            <div
              key={petType.id}
              className={`flex items-center gap-2 rounded-lg border p-2 transition-colors ${
                selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
              }`}
            >
              <Checkbox
                id={`pet-type-${petType.id}`}
                checked={selected}
                onCheckedChange={(checked) => handleToggle(petType.id, checked === true)}
              />
              <IconComponent className="h-4 w-4 text-muted-foreground" />
              <Label
                htmlFor={`pet-type-${petType.id}`}
                className="flex-1 cursor-pointer text-sm font-normal"
              >
                {petType.name}
              </Label>
              {confidence === 'inferred' && (
                <Badge variant="secondary" className="text-xs">
                  Auto
                </Badge>
              )}
              {confidence === 'verified' && (
                <Badge variant="default" className="text-xs">
                  Verified
                </Badge>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Select which pet types this product is suitable for
      </p>
    </div>
  );
}
