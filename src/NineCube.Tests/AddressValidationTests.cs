using NineCube.Application.Contracts;
using NineCube.Application.Validation;
using NineCube.Domain;

namespace NineCube.Tests;

public sealed class AddressValidationTests
{
    [Theory]
    [InlineData("US", "CA", "Los Angeles", "90001")]
    [InlineData("GB", "", "London", "SW1A 1AA")]
    [InlineData("AE", "Dubai", "", "")]
    [InlineData("BD", "Dhaka", "Dhaka", "")]
    public void CountrySpecificRequirementsAcceptDifferentAddressStructures(string code, string region, string city, string postal)
    {
        var request = new AddressRequest("Home", region, city, code == "BD" ? "Unlisted village" : "", "12 Example Street",
            CountryCode: code, PostalCode: postal, Phone: "+1 (202) 555-0123");
        Assert.Empty(AddressValidation.Errors(request));
    }

    [Fact]
    public void UsRequiresStateAndZipButDoesNotRequireUpazila()
    {
        var errors = AddressValidation.Errors(new AddressRequest("Work", "", "Boston", "", "12 Example Street", CountryCode: "US"));
        Assert.Contains("division", errors.Keys);
        Assert.Contains("postalCode", errors.Keys);
        Assert.DoesNotContain("upazila", errors.Keys);
    }

    [Fact]
    public void UnknownCountriesAndOversizedOptionalFieldsAreRejected()
    {
        var errors = AddressValidation.Errors(new AddressRequest("Home", "", "City", "", "Street", CountryCode: "ZZ", DeliveryInstructions: new string('x', 1001)));
        Assert.Contains("countryCode", errors.Keys);
        Assert.Contains("deliveryInstructions", errors.Keys);
        Assert.NotNull(AddressCountries.Find("XK"));
        Assert.NotNull(AddressCountries.Find("AC"));
    }
}
