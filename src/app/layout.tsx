import type { Metadata,Viewport } from 'next';
import './globals.css';
export const metadata:Metadata={title:'SOCKIT · Business Manager',description:'Tu colección, tus ventas y tus finanzas en un solo lugar.',manifest:'/manifest.webmanifest',icons:{icon:'/brand/optimized/icons/favicon.svg',apple:'/brand/icons/app-180.png'}};
export const viewport:Viewport={themeColor:'#6E2A35'};
export default function RootLayout({children}:{children:React.ReactNode}) {
 return <html lang="es"><body>{children}</body></html>;
}
