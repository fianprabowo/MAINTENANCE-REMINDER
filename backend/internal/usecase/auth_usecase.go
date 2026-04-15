package usecase

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/tiketcom/maintenance-reminder/internal/domain"
	"golang.org/x/crypto/bcrypt"
)

type AuthUsecase struct {
	userRepo  domain.UserRepository
	jwtSecret string
	jwtExpiry int
}

func NewAuthUsecase(userRepo domain.UserRepository, jwtSecret string, jwtExpiry int) *AuthUsecase {
	return &AuthUsecase{
		userRepo:  userRepo,
		jwtSecret: jwtSecret,
		jwtExpiry: jwtExpiry,
	}
}

type RegisterInput struct {
	Email    *string `json:"email" validate:"omitempty,email"`
	Phone    *string `json:"phone" validate:"omitempty,min=8,max=20"`
	Password string  `json:"password" validate:"required,min=6"`
	Name     string  `json:"name" validate:"required,min=2"`
}

type LoginInput struct {
	Email    *string `json:"email" validate:"omitempty,email"`
	Phone    *string `json:"phone" validate:"omitempty"`
	Password string  `json:"password" validate:"required"`
}

type AuthResponse struct {
	Token string       `json:"token"`
	User  *domain.User `json:"user"`
}

func (u *AuthUsecase) Register(input RegisterInput) (*AuthResponse, error) {
	if input.Email == nil && input.Phone == nil {
		return nil, domain.ErrEmailOrPhoneRequired
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	user := &domain.User{
		Email:    input.Email,
		Phone:    input.Phone,
		Password: string(hashed),
		Name:     input.Name,
		Role:     "user",
	}

	if err := u.userRepo.Create(user); err != nil {
		return nil, err
	}

	token, err := u.generateToken(user)
	if err != nil {
		return nil, err
	}

	return &AuthResponse{Token: token, User: user}, nil
}

func (u *AuthUsecase) Login(input LoginInput) (*AuthResponse, error) {
	var user *domain.User
	var err error

	if input.Email != nil && *input.Email != "" {
		user, err = u.userRepo.GetByEmail(*input.Email)
	} else if input.Phone != nil && *input.Phone != "" {
		user, err = u.userRepo.GetByPhone(*input.Phone)
	} else {
		return nil, domain.ErrInvalidCredential
	}

	if err != nil {
		return nil, domain.ErrInvalidCredential
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password)); err != nil {
		return nil, domain.ErrInvalidCredential
	}

	token, err := u.generateToken(user)
	if err != nil {
		return nil, err
	}

	return &AuthResponse{Token: token, User: user}, nil
}

func (u *AuthUsecase) GetProfile(userID int64) (*domain.User, error) {
	return u.userRepo.GetByID(userID)
}

func (u *AuthUsecase) generateToken(user *domain.User) (string, error) {
	claims := jwt.MapClaims{
		"user_id": user.ID,
		"role":    user.Role,
		"exp":     time.Now().Add(time.Duration(u.jwtExpiry) * time.Hour).Unix(),
		"iat":     time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(u.jwtSecret))
}
