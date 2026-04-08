import React from 'react';

const BusinessOverviewCard = ({ 
  icon: Icon, 
  label, 
  value, 
  prefix = "", 
  trendValue = "", 
  trendType = "up", 
  subText = "",
  onClick,
  primaryColor = "#017B51", 
  hoverColor = "#F68B1E",
  backgroundColor = "#FFFFFF", // Default to white
}) => {
  return (
    <div className="w-full h-full">
      <div
        className="group relative h-full rounded-2xl border-2 p-6 cursor-pointer transition-all duration-500 shadow-sm hover:shadow-xl flex flex-col justify-between"
        style={{ 
          backgroundColor: backgroundColor, // Fix: Use style for dynamic hex colors
          borderColor: `${primaryColor}20`, 
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = hoverColor)}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = `${primaryColor}20`)}
        onClick={onClick}
      >
        <div>
          {/* Top Section: Icon */}
          <div className="mb-6 flex items-center justify-between">
            <div 
              className="inline-flex p-3.5 rounded-2xl transition-all duration-300"
              style={{ backgroundColor: `rgba(255, 255, 255, 0.2)` }} // Using white overlay for contrast
            >
              {/* <Icon 
                className="h-6 w-6 transition-colors duration-300 text-white" 
              /> */}
              {Icon ? <Icon 
                className="h-6 w-6 transition-colors duration-300 text-white" 
              /> : <span className='text-2xl  text-white px-1'>৳</span>}
            </div>
            
            <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
              </span>
              <span className="text-[10px] font-bold text-white uppercase tracking-wider">Active</span>
            </div>
          </div>

          {/* Middle Section: Label & Value */}
          <div className="space-y-1">
            <span className="text-sm font-semibold text-white/90 tracking-tight block">
              {label}
            </span>
            <div className="flex items-baseline gap-1">
              {prefix && (
                <span className="text-xl font-bold text-white/70">{prefix}</span>
              )}
              <h2 className="text-3xl font-extrabold text-white tracking-tight">
                {typeof value === 'number' ? value.toLocaleString() : value}
              </h2>
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
          {trendValue ? (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-white/20 text-white">
              <span>{trendType === 'up' ? '↑' : '↓'}</span>
              <span>{trendValue}</span>
            </div>
          ) : (
            <div className="h-6" />
          )}
          
          {subText && (
            <span className="text-[10px] text-white/80 font-medium italic max-w-[120px] text-right leading-tight">
              {subText}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default BusinessOverviewCard;