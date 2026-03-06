import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    async rewrites() {
        return [
            {
                // Proxy all /api/* requests to Python backend EXCEPT
                // /api/market-prices which is handled by Next.js natively
                source: '/api/((?!market-prices).*)',
                destination: 'http://127.0.0.1:8000/api/:1*',
            },
        ];
    },
};

export default nextConfig;
