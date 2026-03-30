/**
 * FramerateSlider.tsx
 *
 * Slider component for selecting video framerate for conversion.
 */

interface FramerateSliderProps {
  value: number;
  onChange: (fps: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
}

export function FramerateSlider({
  value,
  onChange,
  disabled = false,
  min = 1,
  max = 20,
  step = 1,
}: FramerateSliderProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(parseFloat(e.target.value));
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
          Frame rate (fps)
        </label>
        <span className="text-sm font-semibold text-primary bg-blue-50 border border-blue-100 px-3 py-1 rounded">
          {value.toFixed(1)} fps
        </span>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className={`w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-primary transition-opacity ${
          disabled ? "opacity-50 cursor-default" : "opacity-100"
        }`}
        style={{
          background: disabled
            ? "#ddd"
            : `linear-gradient(to right, #4f9eff 0%, #4f9eff ${(value - min) / (max - min) * 100}%, #e5e7eb ${(value - min) / (max - min) * 100}%, #e5e7eb 100%)`,
        }}
      />

      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          appearance: none;
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: linear-gradient(135deg, #4f9eff 0%, #2e7fd9 100%);
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(79, 158, 255, 0.4);
          transition: all 0.2s ease;
          border: 2px solid #fff;
        }

        input[type="range"]::-webkit-slider-thumb:hover {
          box-shadow: 0 4px 12px rgba(79, 158, 255, 0.6);
          transform: scale(1.15);
        }

        input[type="range"]::-webkit-slider-thumb:active {
          transform: scale(0.95);
        }

        input[type="range"]::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: linear-gradient(135deg, #4f9eff 0%, #2e7fd9 100%);
          cursor: pointer;
          border: 2px solid #fff;
          box-shadow: 0 2px 8px rgba(79, 158, 255, 0.4);
          transition: all 0.2s ease;
        }

        input[type="range"]::-moz-range-thumb:hover {
          box-shadow: 0 4px 12px rgba(79, 158, 255, 0.6);
          transform: scale(1.15);
        }

        input[type="range"]::-moz-range-thumb:active {
          transform: scale(0.95);
        }

        input[type="range"]::-moz-range-track {
          background: transparent;
          border: none;
        }

        input[type="range"]:disabled::-webkit-slider-thumb {
          cursor: default;
          opacity: 0.5;
        }

        input[type="range"]:disabled::-moz-range-thumb {
          cursor: default;
          opacity: 0.5;
        }
      `}</style>

      <div className="flex justify-between mt-2 text-xs text-gray-500 font-medium">
        <span>{min} fps</span>
        <span>{max} fps</span>
      </div>
    </div>
  );
}
