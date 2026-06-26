import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Leaflet needs to be excluded from server-side rendering
  // Dynamic imports with ssr:false handle this per-component
}

export default nextConfig
