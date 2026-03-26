# Plan: Finalizing Tab Redesign - Image Carousel

Redesign the "Finalizing" tab of the ingestion pipeline to include a large, high-visibility image carousel. This will allow users to better verify product details (name, weight, ingredients, etc.) from the product images during the final review and publishing process.

## Objectives
- **High Visibility**: Provide a large, prominent view of selected product images.
- **Improved Verification**: Enable zooming or fullscreen viewing of images to "actually read" small text on packaging.
- **Seamless Integration**: Ensure the carousel is integrated into the existing editing workflow without adding excessive friction.
- **Sync Selection**: Automatically update the carousel when images are selected or deselected from the candidates grid.

## Key Files & Context
- `apps/web/components/admin/pipeline/FinalizingResultsView.tsx`: The main component for the "Finalizing" tab.
- `apps/web/components/ui/carousel.tsx`: The base carousel component.
- `apps/web/components/ui/dialog.tsx`: For the fullscreen/zoom view.

## Implementation Steps

### 1. Preparation
- [ ] Add necessary imports to `FinalizingResultsView.tsx`:
    - `Carousel`, `CarouselContent`, `CarouselItem`, `CarouselPrevious`, `CarouselNext`, `CarouselApi` from `@/components/ui/carousel`.
    - `Dialog`, `DialogContent`, `DialogTrigger` from `@/components/ui/dialog`.
    - `Maximize2`, `ZoomIn`, `ZoomOut` icons from `lucide-react`.

### 2. State Management
- [ ] Add `carouselApi` state to control the carousel programmatically:
    ```tsx
    const [api, setApi] = useState<CarouselApi>();
    ```
- [ ] Add state for the currently active image index in the carousel (to sync with thumbnails):
    ```tsx
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    ```
- [ ] Add state for the "Zoom" modal:
    ```tsx
    const [isZoomOpen, setIsZoomOpen] = useState(false);
    const [zoomImage, setZoomImage] = useState<string | null>(null);
    ```

### 3. Carousel Component Integration
- [ ] In `FinalizingResultsView.tsx`, refactor the "Media Management" section:
    - Replace the small "Selected Images Grid" with a larger `Carousel` at the top of the right column.
    - The carousel should display `formData.selectedImages`.
    - If no images are selected, show a large "No Images Selected" placeholder.
- [ ] Implement the `CarouselContent` to show images at a large size (e.g., `aspect-square` or `h-[400px]`).
- [ ] Add `CarouselPrevious` and `CarouselNext` buttons, styled for high visibility.
- [ ] Add a "Zoom" button overlay on the active carousel image.

### 4. Zoom/Fullscreen Modal
- [ ] Implement a `Dialog` that opens when the zoom button is clicked or the image itself is clicked.
- [ ] The `DialogContent` should show the image at its natural size or maximum possible size within the viewport.
- [ ] Add basic zoom controls (CSS transform) or just rely on the large size.

### 5. Interaction Refinements
- [ ] Update `toggleImage` to move the carousel to the newly added image if it wasn't already there.
- [ ] Keep the "Selected Images" thumbnails below the carousel for quick navigation between selected images.
- [ ] Keep the "Image Candidates" grid for adding more images.

## Verification & Testing
1. **Carousel Navigation**:
    - Verify that the carousel correctly cycles through all selected images.
    - Verify that keyboard navigation (Left/Right arrows) works when the carousel is focused.
2. **Selection Sync**:
    - Select an image from "Candidates" and verify it appears in the carousel.
    - Deselect an image and verify the carousel updates correctly.
3. **Zoom Functionality**:
    - Click the zoom button on an image in the carousel.
    - Verify the modal opens and the image is large and clear.
4. **Layout Check**:
    - Verify that the layout remains functional on different screen sizes (though this is an admin tool, it should still be usable).
