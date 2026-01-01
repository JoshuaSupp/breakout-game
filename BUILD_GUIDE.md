# Build Guide - Compressed PixiJS Game

## 🚀 Quick Start

### Install Dependencies
```bash
npm install
```

### Development Build (Fast, Uncompressed)
```bash
npm run build:dev
# or
npm run dev  # with hot reload
```

### Production Build (Compressed & Optimized)
```bash
npm run build
```

### Serve Production Build
```bash
npm run serve
# Opens at http://localhost:3000
```

## 📊 Build Results

### File Sizes Comparison
| File | Original | Gzipped | Brotli | Compression Ratio |
|------|----------|---------|---------|-------------------|
| vendors.js | 500KB | 147KB | 118KB | **76% smaller** |
| main.js | 8KB | ~3KB | ~2KB | **75% smaller** |
| Total | ~508KB | ~150KB | ~120KB | **76% smaller** |

## 🔧 Build Features

### ✅ Optimizations Applied
- **Code Splitting**: Vendor libraries separated from your code
- **Tree Shaking**: Dead code elimination
- **Minification**: Terser with aggressive compression
- **Gzip Compression**: Compatible with all browsers
- **Brotli Compression**: Better compression for modern browsers
- **Content Hashing**: Cache-busting filenames
- **HTML Minification**: Optimized index.html

### 📦 Webpack Configurations
- `webpack.dev.js` - Development build (fast, source maps)
- `webpack.prod.js` - Production build (optimized, compressed)
- `webpack.config.js` - Default (currently development)

## 🎯 Available Scripts

```bash
# Development
npm run dev          # Start dev server with hot reload
npm run build:dev    # Build for development

# Production  
npm run build        # Build optimized production version
npm run serve        # Serve production build locally
npm run clean        # Clean dist folder

# Analysis
npm run build:analyze # Build with bundle analyzer
```

## 🔍 Build Analysis

To analyze your bundle size and dependencies:
```bash
npm run build:analyze
```

This creates a `bundle-report.html` file showing:
- Bundle size breakdown
- Dependency tree
- Code splitting results
- Optimization opportunities

## 🌐 Deployment

### Static Hosting (Netlify, Vercel, GitHub Pages)
1. Run `npm run build`
2. Upload the `dist/` folder
3. Configure server to serve `.gz` and `.br` files with proper headers

### Server Configuration
For Apache/Nginx, add these headers for compressed files:
```nginx
# Gzip
location ~* \.gz$ {
    add_header Content-Encoding gzip;
    gzip off;
}

# Brotli  
location ~* \.br$ {
    add_header Content-Encoding br;
    gzip off;
}
```

## ⚡ Performance Tips

1. **Lazy Loading**: Consider splitting PixiJS if not immediately needed
2. **Asset Optimization**: Compress images and audio files
3. **CDN**: Use CDN for PixiJS and other large libraries
4. **Service Worker**: Add offline support with Workbox

## 🐛 Troubleshooting

### Build Fails
- Check Node.js version (requires 16+)
- Clear node_modules: `rm -rf node_modules && npm install`
- Check for TypeScript errors: `npx tsc --noEmit`

### Large Bundle Size
- Run `npm run build:analyze` to identify large dependencies
- Consider using PixiJS core instead of full bundle
- Implement code splitting for game assets