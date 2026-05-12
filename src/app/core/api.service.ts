import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl = environment.apiUrl;
  constructor(private readonly http: HttpClient) {}

  get<T>(path: string, params?: Record<string, string | number | boolean | null | undefined>): Observable<T> {
    let httpParams = new HttpParams();
    Object.entries(params ?? {}).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        httpParams = httpParams.set(key, String(value));
      }
    });
    return this.http.get<T>(`${this.baseUrl}${path}`, { params: httpParams });
  }

  post<T>(path: string, body: unknown): Observable<T> { return this.http.post<T>(`${this.baseUrl}${path}`, body); }
  put<T>(path: string, body: unknown): Observable<T> { return this.http.put<T>(`${this.baseUrl}${path}`, body); }
  delete<T>(path: string): Observable<T> { return this.http.delete<T>(`${this.baseUrl}${path}`); }
  upload<T>(path: string, file: File): Observable<T> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<T>(`${this.baseUrl}${path}`, form);
  }

  download(path: string, params?: Record<string, string | number | boolean | null | undefined>): Observable<Blob> {
    let httpParams = new HttpParams();
    Object.entries(params ?? {}).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        httpParams = httpParams.set(key, String(value));
      }
    });
    return this.http.get(`${this.baseUrl}${path}`, { params: httpParams, responseType: 'blob' });
  }
}

