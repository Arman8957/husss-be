// src/common/interceptors/transform.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,

} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';

export interface Response<T> {
  success: boolean;
  data: T;
  timestamp: string;
  path?: string;
  method?: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  constructor(private readonly reflector?: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    const request = context.switchToHttp().getRequest();
    
    return next.handle().pipe(
      map((data) => {
        const response: Response<T> = {
          success: true,
          data,
          timestamp: new Date().toISOString(),
        };
        
        // Optional: Add request info for debugging
        if (process.env.NODE_ENV === 'development') {
          response.path = request.path;
          response.method = request.method;
        }
        
        return response;
      }),
    );
  }
}