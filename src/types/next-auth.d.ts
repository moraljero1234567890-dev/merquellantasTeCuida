import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      nombre: string;
      rol: string;
      cedula: string;
      ciudad?: string | null;
    };
    accessToken?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    dbId?: string;
    nombre?: string;
    rol?: string;
    cedula?: string;
    ciudad?: string | null;
    accessToken?: string;
  }
}
