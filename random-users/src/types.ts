export interface ApiResponse<T> {
  statusCode: number;
  data: T;
  message: string;
  success: boolean;
}

export interface Paginated<T> {
  page: number;
  limit: number;
  totalPages: number;
  nextPage: boolean;
  previousPage: boolean;
  totalItems: number;
  currentPageItems: number;
  data: T[];
}

export interface StreetObject {
  number?: number | string;
  name?: string;
}

export interface RandomUser {
  id: number;
  gender: string;
  nat: string;
  email: string;
  phone: string;
  cell: string;
  name: {
    title: string;
    first: string;
    last: string;
  };
  picture: {
    large: string;
    medium: string;
    thumbnail: string;
  };
  location: {
    street?: StreetObject | string;
    city: string;
    state: string;
    country: string;
    postcode: string | number;
  };
  dob: {
    date: string;
    age: number;
  };
  login: {
    username: string;
  };
}

export type ViewMode = 'grid' | 'list';
export type GenderFilter = 'all' | 'male' | 'female';

