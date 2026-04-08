import React, { useState, useEffect } from 'react';
import * as Slider from '@radix-ui/react-slider';

const slides = [
  { id: 1, title: "PREMIUM COLLECTION", image: "https://images.unsplash.com/photo-1507842217343-583bb7270b66" },
  { id: 2, title: "NEW ARRIVALS", image: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570" },
  { id: 3, title: "EDITOR'S CHOICE", image: "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f" },
];

const PremiumRadixSlider = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [progress, setProgress] = useState([0]);

  // Autoplay Logic
  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev[0] >= 100) {
          setActiveTab((prevTab) => (prevTab + 1) % slides.length);
          return [0];
        }
        return [prev[0] + 1];
      });
    }, 50); // Speed control

    return () => clearInterval(timer);
  }, [activeTab]);

  return (
    <div className="container mx-auto px-4 lg:px-8 relative w-full h-[500px] md:h-[650px] bg-white overflow-hidden">
      {/* Background Images */}
      {slides.map((slide, index) => (
        <div
          key={slide.id}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            index === activeTab ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="absolute inset-0 bg-black/20 z-10" />
          <img src={slide.image} alt={slide.title} className="w-full h-full object-cover " />
        </div>
      ))}

      {/* Center Content */}
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-5xl md:text-8xl font-black text-white tracking-tighter mb-4">
          {slides[activeTab].title}
        </h1>
        <div className="h-1.5 w-32 bg-[#F68B1E] mb-6" />
        <button className="bg-[#2C8C67] hover:bg-black text-white px-14 py-4 rounded-none font-bold text-sm tracking-widest transition-all duration-500">
          EXPLORE NOW
        </button>
      </div>

      {/* Radix Slider Progress UI */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-64 md:w-96 z-30">
        <div className="flex justify-between mb-3">
          {slides.map((_, i) => (
            <span 
              key={i} 
              className={`text-[11px] font-black ${i === activeTab ? "text-[#F68B1E]" : "text-black/20"}`}
            >
              0{i + 1}
            </span>
          ))}
        </div>
        
        <Slider.Root
          className="relative flex items-center select-none touch-none w-full h-5"
          value={progress}
          max={100}
          step={1}
        >
          <Slider.Track className="bg-black/5 relative grow h-[3px]">
            <Slider.Range className="absolute bg-[#F68B1E] h-full" />
          </Slider.Track>
          <Slider.Thumb
            className="block w-5 h-5 bg-[#2C8C67] shadow-xl border-2 border-white rounded-full focus:outline-none transition-transform hover:scale-125 cursor-pointer"
          />
        </Slider.Root>
      </div>
    </div>
  );
};

export default PremiumRadixSlider;