import {NextResponse,type NextRequest} from 'next/server';
import {isLocal,supabase} from '@/lib/auth';
export async function GET(request:NextRequest){
 const code=request.nextUrl.searchParams.get('code');
 if(!isLocal()&&code){const {error}=await(await supabase()).auth.exchangeCodeForSession(code);if(!error)return NextResponse.redirect(new URL('/reset-password',request.url));}
 return NextResponse.redirect(new URL('/recover?message=Enlace%20inv%C3%A1lido%20o%20vencido.%20Solicita%20uno%20nuevo.',request.url));
}
