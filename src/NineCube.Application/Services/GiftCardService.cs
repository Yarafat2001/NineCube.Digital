using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using NineCube.Application.Abstractions;
using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Services;

public sealed class GiftCardService : IGiftCardService
{
    private readonly IAppDbContext _db;
    private readonly IClock _clock;

    public GiftCardService(IAppDbContext db, IClock clock)
    {
        _db = db;
        _clock = clock;
    }

    public async Task<IReadOnlyList<GiftCardDto>> ListGiftCardsAsync(CancellationToken ct = default)
    {
        var cards = await _db.GiftCards.AsNoTracking()
            .OrderByDescending(g => g.CreatedAt)
            .ToListAsync(ct);

        return cards.Select(MapToDto).ToList();
    }

    public async Task<GiftCardDto> CreateGiftCardAsync(CreateGiftCardRequest request, CancellationToken ct = default)
    {
        if (request.InitialBalance <= 0)
        {
            throw new BusinessValidationException("Gift card initial balance must be greater than zero.");
        }

        var code = string.IsNullOrWhiteSpace(request.Code)
            ? GenerateGiftCardCode()
            : request.Code.Trim().ToUpperInvariant();

        if (await _db.GiftCards.AnyAsync(g => g.Code == code, ct))
        {
            throw new ResourceConflictException($"A gift card with code '{code}' already exists.", "duplicate_code");
        }

        var card = new GiftCard
        {
            Code = code,
            InitialBalance = request.InitialBalance,
            CurrentBalance = request.InitialBalance,
            Currency = "BDT",
            RecipientEmail = string.IsNullOrWhiteSpace(request.RecipientEmail) ? null : request.RecipientEmail.Trim(),
            RecipientName = string.IsNullOrWhiteSpace(request.RecipientName) ? null : request.RecipientName.Trim(),
            Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim(),
            ExpiresAt = request.ExpiresAt,
            CreatedAt = _clock.UtcNow,
            IsActive = true
        };

        _db.GiftCards.Add(card);
        await _db.SaveChangesAsync(ct);

        return MapToDto(card);
    }

    public async Task<GiftCardDto> ToggleStatusAsync(int id, CancellationToken ct = default)
    {
        var card = await _db.GiftCards.FirstOrDefaultAsync(g => g.Id == id, ct);
        if (card is null)
        {
            throw new NotFoundException($"Gift card with ID {id} was not found.");
        }

        card.IsActive = !card.IsActive;
        await _db.SaveChangesAsync(ct);

        return MapToDto(card);
    }

    public async Task<GiftCardDto> AdjustBalanceAsync(int id, AdjustGiftCardBalanceRequest request, CancellationToken ct = default)
    {
        var card = await _db.GiftCards.FirstOrDefaultAsync(g => g.Id == id, ct);
        if (card is null)
        {
            throw new NotFoundException($"Gift card with ID {id} was not found.");
        }

        if (request.NewBalance < 0)
        {
            throw new BusinessValidationException("Gift card balance cannot be negative.");
        }

        card.CurrentBalance = request.NewBalance;
        await _db.SaveChangesAsync(ct);

        return MapToDto(card);
    }

    public async Task<ValidateGiftCardResponse> ValidateGiftCardAsync(string code, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return new ValidateGiftCardResponse(false, null, 0, "BDT", null, "Please enter a gift card code.");
        }

        var normalizedCode = code.Trim().ToUpperInvariant();
        var card = await _db.GiftCards.AsNoTracking()
            .FirstOrDefaultAsync(g => g.Code == normalizedCode, ct);

        if (card is null)
        {
            return new ValidateGiftCardResponse(false, null, 0, "BDT", null, "Gift card code not found.");
        }

        if (!card.IsActive)
        {
            return new ValidateGiftCardResponse(false, card.Code, 0, card.Currency, card.RecipientName, "This gift card has been disabled.");
        }

        if (card.ExpiresAt.HasValue && card.ExpiresAt.Value < _clock.UtcNow)
        {
            return new ValidateGiftCardResponse(false, card.Code, 0, card.Currency, card.RecipientName, "This gift card has expired.");
        }

        if (card.CurrentBalance <= 0)
        {
            return new ValidateGiftCardResponse(false, card.Code, 0, card.Currency, card.RecipientName, "This gift card has zero remaining balance.");
        }

        return new ValidateGiftCardResponse(true, card.Code, card.CurrentBalance, card.Currency, card.RecipientName, null);
    }

    private static string GenerateGiftCardCode()
    {
        // 12 alphanumeric characters formatted as GC-XXXX-XXXX-XXXX
        const string chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // exclude ambiguous chars like 0, O, 1, I
        var bytes = RandomNumberGenerator.GetBytes(12);
        var result = new char[12];
        for (var i = 0; i < 12; i++)
        {
            result[i] = chars[bytes[i] % chars.Length];
        }

        return $"GC-{new string(result, 0, 4)}-{new string(result, 4, 4)}-{new string(result, 8, 4)}";
    }

    private static GiftCardDto MapToDto(GiftCard g) => new(
        g.Id,
        g.Code,
        g.InitialBalance,
        g.CurrentBalance,
        g.Currency,
        g.RecipientEmail,
        g.RecipientName,
        g.Note,
        g.IsActive,
        g.ExpiresAt,
        g.CreatedAt,
        g.LastUsedAt);
}
