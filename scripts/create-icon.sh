#!/bin/bash

# Create a simple placeholder icon for the SSH Remote Extension
# This creates a basic SVG icon that can be converted to PNG

echo "🎨 Creating SSH Remote Extension Icon"
echo "====================================="

# Create the icon directory if it doesn't exist
mkdir -p resources

# Create a simple SVG icon
cat > resources/icon.svg << 'EOF'
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="128" height="128" rx="16" fill="#1e415e"/>
  
  <!-- Server/Computer icon -->
  <rect x="24" y="32" width="80" height="48" rx="4" fill="#ffffff" opacity="0.9"/>
  <rect x="32" y="40" width="64" height="8" rx="2" fill="#1e415e"/>
  <rect x="32" y="52" width="48" height="4" rx="2" fill="#1e415e"/>
  <rect x="32" y="60" width="56" height="4" rx="2" fill="#1e415e"/>
  <rect x="32" y="68" width="40" height="4" rx="2" fill="#1e415e"/>
  
  <!-- SSH/Connection lines -->
  <line x1="88" y1="48" x2="104" y2="48" stroke="#00ff00" stroke-width="2"/>
  <line x1="88" y1="56" x2="104" y2="56" stroke="#00ff00" stroke-width="2"/>
  <line x1="88" y1="64" x2="104" y2="64" stroke="#00ff00" stroke-width="2"/>
  
  <!-- Remote server -->
  <rect x="104" y="40" width="16" height="32" rx="2" fill="#00ff00" opacity="0.8"/>
  <rect x="108" y="44" width="8" height="4" rx="1" fill="#ffffff"/>
  <rect x="108" y="52" width="8" height="4" rx="1" fill="#ffffff"/>
  <rect x="108" y="60" width="8" height="4" rx="1" fill="#ffffff"/>
  
  <!-- SSH text -->
  <text x="64" y="100" font-family="Arial, sans-serif" font-size="12" font-weight="bold" text-anchor="middle" fill="#ffffff">SSH</text>
</svg>
EOF

echo "✅ SVG icon created: resources/icon.svg"

# Check if ImageMagick is available to convert to PNG
if command -v convert &> /dev/null; then
    echo "🔄 Converting SVG to PNG..."
    convert resources/icon.svg resources/icon.png
    echo "✅ PNG icon created: resources/icon.png"
elif command -v rsvg-convert &> /dev/null; then
    echo "🔄 Converting SVG to PNG..."
    rsvg-convert -w 128 -h 128 resources/icon.svg > resources/icon.png
    echo "✅ PNG icon created: resources/icon.png"
else
    echo "⚠️  ImageMagick or librsvg not found. PNG conversion skipped."
    echo "💡 Install ImageMagick: sudo apt-get install imagemagick"
    echo "💡 Or install librsvg: sudo apt-get install librsvg2-bin"
    echo "📝 You can manually convert the SVG to PNG using any image editor."
fi

echo ""
echo "📋 Icon Information:"
echo "==================="
echo "SVG: resources/icon.svg"
if [ -f "resources/icon.png" ]; then
    echo "PNG: resources/icon.png"
    echo "Size: 128x128 pixels"
fi
echo ""
echo "💡 You can replace this with a custom icon:"
echo "1. Create a 128x128 PNG image"
echo "2. Save it as resources/icon.png"
echo "3. The extension will use your custom icon" 