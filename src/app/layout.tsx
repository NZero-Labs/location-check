import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'Malhas IBGE | Amara NetZero',
  description:
    'Aplicação da Amara NetZero para visualização de malhas geográficas e verificação de coordenadas nos municípios brasileiros.',
  applicationName: 'Malhas IBGE',
  authors: [{ name: 'Amara NetZero' }],
  keywords: ['IBGE', 'malhas geográficas', 'municípios', 'coordenadas', 'Amara NetZero'],
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', type: 'image/x-icon' },
    ],
    shortcut: '/favicon.ico',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
