import { NextResponse, type NextRequest } from "next/server";


export function proxy(request: NextRequest) {
    const response = NextResponse.next();



    const { pathname } = request.nextUrl;
    if (pathname) {
        response.headers.set("x-pathname", pathname);



        request.headers.set("x-pathname", pathname);
    }

    return response;
}

export const config = {

    matcher: [

        "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
    ],
};