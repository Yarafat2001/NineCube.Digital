namespace NineCube.Api.Common;

public static class StorefrontLinks
{
    public static string To(IConfiguration config, string route)
    {
        return new NineCube.Application.Services.StorefrontOptions
        {
            BaseUrl = config["Storefront:BaseUrl"] ?? "https://yarafat2001.github.io/NineCube.Digital/"
        }.Link(route);
    }
}
