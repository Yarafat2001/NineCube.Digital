namespace NineCube.Api.Common;

public static class StorefrontLinks
{
    public static string To(IConfiguration config, string route)
    {
        var configured = config["Storefront:BaseUrl"] ?? "https://yarafat2001.github.io/NineCube.Digital/";
        if (!Uri.TryCreate(configured, UriKind.Absolute, out var uri) || uri.Scheme is not ("https" or "http"))
            throw new InvalidOperationException("Storefront:BaseUrl must be an absolute HTTP(S) URL.");
        return uri.GetLeftPart(UriPartial.Path).TrimEnd('/') + "/#/" + route.TrimStart('/');
    }
}
