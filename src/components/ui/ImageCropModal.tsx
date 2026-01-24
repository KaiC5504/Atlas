import { useState, useRef, useCallback } from 'react';
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, Check, RotateCcw, Info } from 'lucide-react';

interface ImageCropModalProps {
  imageSrc: string;
  onCropComplete: (croppedImageBase64: string) => void;
  onCancel: () => void;
}

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 50, // Start with 50% crop area so user can zoom in by making it smaller
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}

export function ImageCropModal({ imageSrc, onCropComplete, onCancel }: ImageCropModalProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement>(null);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    // Set initial crop to center square (1:1 aspect ratio for avatar)
    setCrop(centerAspectCrop(width, height, 1));
  }, []);

  const handleCropComplete = useCallback(async () => {
    if (!completedCrop || !imgRef.current) return;

    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate the scale between displayed and natural size
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    // Set canvas size to desired output (256x256 for avatar)
    const outputSize = 256;
    canvas.width = outputSize;
    canvas.height = outputSize;

    // Enable image smoothing for better quality
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Draw the cropped portion scaled to output size
    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      outputSize,
      outputSize
    );

    // Convert to base64 (JPEG with good quality for smaller file size)
    const base64 = canvas.toDataURL('image/jpeg', 0.9);
    onCropComplete(base64);
  }, [completedCrop, onCropComplete]);

  const handleReset = () => {
    if (imgRef.current) {
      const { width, height } = imgRef.current;
      setCrop(centerAspectCrop(width, height, 1));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-surface-elevated rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="text-lg font-semibold text-text-primary">Crop Avatar</h3>
          <button onClick={onCancel} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
            <X size={20} className="text-text-secondary" />
          </button>
        </div>

        {/* Crop Area */}
        <div className="p-4 flex justify-center bg-black/20">
          <ReactCrop
            crop={crop}
            onChange={(_, percentCrop) => setCrop(percentCrop)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={1}
            circularCrop
            className="max-h-[400px]"
          >
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Crop preview"
              onLoad={onImageLoad}
              style={{ maxHeight: '400px', maxWidth: '100%' }}
            />
          </ReactCrop>
        </div>

        {/* Controls */}
        <div className="p-4 border-t border-white/10">
          {/* Help text */}
          <div className="flex items-center gap-2 text-xs text-text-muted mb-4 justify-center">
            <Info size={14} />
            <span>Drag to move, resize corners to zoom in/out</span>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="btn btn-ghost px-4"
              title="Reset crop"
            >
              <RotateCcw size={16} />
            </button>
            <button
              onClick={onCancel}
              className="btn btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              onClick={handleCropComplete}
              disabled={!completedCrop}
              className="btn btn-primary flex-1 flex items-center justify-center gap-2"
            >
              <Check size={16} />
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
