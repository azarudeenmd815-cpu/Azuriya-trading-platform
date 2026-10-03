// Package auth implements opaque, revocable sessions and tenant-bound identities.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"time"

	"golang.org/x/crypto/argon2"
)

var ErrCredentials = errors.New("invalid credentials")
var ErrExists = errors.New("email already registered")
var ErrSession = errors.New("session expired or invalid")
var ErrValidation = errors.New("invalid registration data")

type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	TenantID     string    `json:"tenant_id"`
	Role         string    `json:"role"`
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
type Session struct {
	Hash      string
	UserID    string
	ExpiresAt time.Time
}
type Repository interface {
	CreateUser(context.Context, User, string) error
	UserByEmail(context.Context, string) (User, error)
	PutSession(context.Context, Session) error
	SessionUser(context.Context, string, time.Time) (User, error)
	DeleteSession(context.Context, string) error
}

// TenantMemberReader is an optional directory boundary. Returned identities
// contain membership scope and never password hashes or session digests.
type TenantMemberReader interface {
	TenantMembers(context.Context, string) ([]User, error)
}
type Service struct {
	Repo   Repository
	Secure bool
}

func New(repo Repository, secure bool) *Service { return &Service{Repo: repo, Secure: secure} }
func RandomID() string {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
func tokenHash(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}
func HashPassword(password string) (string, error) {
	if len(password) < 12 || len(password) > 128 {
		return "", fmt.Errorf("%w: password must contain 12 to 128 characters", ErrValidation)
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	hash := argon2.IDKey([]byte(password), salt, 2, 64*1024, 2, 32)
	return "$argon2id$v=19$m=65536,t=2,p=2$" + base64.RawStdEncoding.EncodeToString(salt) + "$" + base64.RawStdEncoding.EncodeToString(hash), nil
}
func VerifyPassword(encoded, password string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" || parts[2] != "v=19" || parts[3] != "m=65536,t=2,p=2" {
		return false
	}
	salt, e1 := base64.RawStdEncoding.DecodeString(parts[4])
	expected, e2 := base64.RawStdEncoding.DecodeString(parts[5])
	if e1 != nil || e2 != nil || len(salt) != 16 || len(expected) != 32 || len(password) > 128 {
		return false
	}
	actual := argon2.IDKey([]byte(password), salt, 2, 64*1024, 2, 32)
	return subtle.ConstantTimeCompare(expected, actual) == 1
}
func (s *Service) Register(ctx context.Context, email, password, name string) (User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	address, err := mail.ParseAddress(email)
	if err != nil || address.Address != email || len(email) > 254 {
		return User{}, fmt.Errorf("%w: invalid email address", ErrValidation)
	}
	if len(strings.TrimSpace(name)) < 2 || len(name) > 80 {
		return User{}, fmt.Errorf("%w: workspace name must contain 2 to 80 characters", ErrValidation)
	}
	hash, err := HashPassword(password)
	if err != nil {
		return User{}, err
	}
	now := time.Now().UTC()
	u := User{ID: RandomID(), Email: email, PasswordHash: hash, TenantID: RandomID(), Role: "OWNER", Status: "ACTIVE", CreatedAt: now, UpdatedAt: now}
	if err = s.Repo.CreateUser(ctx, u, name); err != nil {
		return User{}, err
	}
	return u, nil
}
func (s *Service) Login(ctx context.Context, email, password string) (User, string, error) {
	u, err := s.Repo.UserByEmail(ctx, strings.ToLower(strings.TrimSpace(email)))
	if err != nil { // Match hashing work for unknown identities to reduce enumeration timing.
		argon2.IDKey([]byte(password), []byte("azuriya-padding!"), 2, 64*1024, 2, 32)
		if !errors.Is(err, ErrCredentials) {
			return User{}, "", fmt.Errorf("lookup user: %w", err)
		}
		return User{}, "", ErrCredentials
	}
	if u.Status != "ACTIVE" || !VerifyPassword(u.PasswordHash, password) {
		return User{}, "", ErrCredentials
	}
	token := RandomID()
	if err = s.Repo.PutSession(ctx, Session{Hash: tokenHash(token), UserID: u.ID, ExpiresAt: time.Now().Add(12 * time.Hour)}); err != nil {
		return User{}, "", err
	}
	return u, token, nil
}
func (s *Service) Authenticate(ctx context.Context, token string) (User, error) {
	if len(token) != 48 {
		return User{}, ErrSession
	}
	return s.Repo.SessionUser(ctx, tokenHash(token), time.Now())
}
func (s *Service) Logout(ctx context.Context, token string) error {
	return s.Repo.DeleteSession(ctx, tokenHash(token))
}
