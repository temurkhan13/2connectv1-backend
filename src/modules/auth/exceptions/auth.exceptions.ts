import { HttpException, HttpStatus } from '@nestjs/common';

export class InvalidCredentialsException extends HttpException {
  constructor() {
    super('Invalid email or password', HttpStatus.UNAUTHORIZED);
  }
}

export class EmailAlreadyExistsException extends HttpException {
  constructor() {
    super('Email already exists', HttpStatus.CONFLICT);
  }
}

export class GoogleAuthException extends HttpException {
  constructor() {
    super('Google authentication failed', HttpStatus.UNAUTHORIZED);
  }
}

export class AccountNotActiveException extends HttpException {
  constructor() {
    super(
      'Your account has been deactivated by the Admin. Please contact support@2connect.ai for further details.',
      HttpStatus.FORBIDDEN,
    );
  }
}
