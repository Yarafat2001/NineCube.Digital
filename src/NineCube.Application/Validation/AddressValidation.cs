using NineCube.Application.Contracts;
using NineCube.Domain;

namespace NineCube.Application.Validation;

public static class AddressValidation
{
    public static Dictionary<string, string[]> Errors(AddressRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        var country = AddressCountries.Find(request.CountryCode);
        var domestic = string.Equals(request.CountryCode?.Trim() ?? "BD", "BD", StringComparison.OrdinalIgnoreCase);
        if (country is null) errors["countryCode"] = ["Choose a valid country or region."];
        void Field(string key, string? value, int max, string label, bool required = false)
        {
            var length = value?.Trim().Length ?? 0;
            if (required && length == 0) errors[key] = [$"{label} is required."];
            else if (length > max) errors[key] = [$"{label} must be at most {max} characters."];
        }
        Field("label", request.Label, 60, "Label", true);
        Field("addressLine", request.AddressLine, 300, "Address line", true);
        Field("division", request.Division, 80, domestic ? "Division" : "State / region", domestic || country?.Requires('S') == true);
        Field("district", request.District, 80, domestic ? "District" : "City / town", domestic || country?.Requires('C') == true);
        Field("upazila", request.Upazila, 80, domestic ? "Area / thana / upazila" : "Area", domestic || country?.Requires('D') == true);
        Field("postalCode", request.PostalCode, 32, "Postal code", !domestic && country?.Requires('Z') == true);
        Field("recipientName", request.RecipientName, 200, "Recipient name");
        Field("company", request.Company, 200, "Company");
        Field("addressLine2", request.AddressLine2, 200, "Apartment / floor / building");
        Field("landmark", request.Landmark, 200, "Landmark");
        Field("deliveryInstructions", request.DeliveryInstructions, 1000, "Delivery instructions");
        var phone = request.Phone?.Trim();
        if (!string.IsNullOrEmpty(phone) && (phone.Length is < 6 or > 20 || phone.Count(char.IsDigit) < 6 || phone.Any(c => !char.IsDigit(c) && c is not (' ' or '+' or '-' or '(' or ')' or '.'))))
            errors["phone"] = ["Phone number is not valid."];
        return errors;
    }
}
