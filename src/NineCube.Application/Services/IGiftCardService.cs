using NineCube.Application.Contracts;

namespace NineCube.Application.Services;

public interface IGiftCardService
{
    Task<IReadOnlyList<GiftCardDto>> ListGiftCardsAsync(CancellationToken ct = default);
    Task<GiftCardDto> CreateGiftCardAsync(CreateGiftCardRequest request, CancellationToken ct = default);
    Task<GiftCardDto> ToggleStatusAsync(int id, CancellationToken ct = default);
    Task<GiftCardDto> AdjustBalanceAsync(int id, AdjustGiftCardBalanceRequest request, CancellationToken ct = default);
    Task<ValidateGiftCardResponse> ValidateGiftCardAsync(string code, CancellationToken ct = default);
    Task<GiftCardDto> UpdateGiftCardAsync(int id, UpdateGiftCardRequest request, CancellationToken ct = default);
    Task<bool> DeleteGiftCardAsync(int id, CancellationToken ct = default);
}
