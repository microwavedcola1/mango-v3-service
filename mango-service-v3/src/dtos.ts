export interface BadParamError {
    value:    string;
    msg:      string;
    param:    string;
    location: string;
}

export interface BadRequestError {
    msg:      string;
}
