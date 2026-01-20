export interface User {
    name: string;
    email: string;
    picture?: string;
}

export interface AuthConfig {
    auth_enabled: boolean;
    dev_mode: boolean;
    google_client_id: string;
}
