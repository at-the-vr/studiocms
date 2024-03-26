import { // Tools and Utilities
    defineIntegration, createResolver, 
    addVirtualImports, watchIntegration, 
    addIntegration, hasIntegration
} from "astro-integration-kit";
import "astro-integration-kit/types/db";
import { AstroError } from "astro/errors";
import { loadEnv } from "vite";
import { integrationLogger } from "./utils";

// Adapters
import vercel from "@astrojs/vercel/serverless";
import netlify from "@astrojs/netlify";
import cloudflare from "@astrojs/cloudflare";

// Integrations
import robots from "astro-robots";
import sitemap from "@inox-tools/sitemap-ext";

// Image Services
import { imageService as unpicImageService } from "@unpic/astro/service";
import { 
    passthroughImageService, 
    sharpImageService, 
    squooshImageService
} from "astro/config";

// Options Schema
import { optionsSchema } from "./schemas";

// Environment Variables
const { 
    CMS_GITHUB_CLIENT_ID, 
    CMS_GITHUB_CLIENT_SECRET, 
    CMS_CLOUDINARY_CLOUDNAME,
    CMS_WATCH_INTEGRATION_HOOK 
} = loadEnv( "all", process.cwd(), "CMS");

// Main Integration
export default defineIntegration({
    name: "astro-studiocms",
    optionsSchema,
    setup({ 
        name, 
        options, 
        options: { 
            verbose, 
            dbStartPage, 
            imageService: { 
                astroImageServiceConfig, 
                cdnPlugin,
                useUnpic, 
                unpicConfig: { 
                    fallbackService, 
                    layout, 
                    placeholder, 
                    cdnOptions,
                }, 
            }, 
            authConfig: {
                mode: authMode,
            }, 
            includedIntegrations: { 
                astroRobots, 
                inoxSitemap,
            },
        },
    }) {
        // Create Resolver for Virtual Imports
        const { resolve } = createResolver(import.meta.url);

        return {
            "astro:db:setup": ({ extendDb }) => {
                extendDb({
                    configEntrypoint: resolve('./db/config.ts'),
                    // seedEntrypoint: resolve('./db/seed.ts'),
                });
            },
            "astro:config:setup": ( params ) => {
                
                const { 
                    addMiddleware, 
                    updateConfig, 
                    injectRoute, 
                    logger,
                    config: { 
                        base, 
                        adapter, 
                        output, 
                        site 
                    },
                } = params;

                // Watch Integration for changes in dev mode *TO BE REMOVED*
                if (CMS_WATCH_INTEGRATION_HOOK) {
                    integrationLogger(logger.fork("Astro-StudioCMS-Dev"), verbose, "warn", "Watching Integration for Changes... This should only be enabled during Development of the Integration.")
                    watchIntegration(params, resolve());
                }

                // Check for SSR Mode
                if (output !== "server" ) {
                    throw new AstroError("Astro Studio CMS is only supported in 'Output: server' SSR mode.");
                };

                // Check for Site URL
                if (!site) {
                    throw new AstroError("Astro Studio CMS requires a 'site' configuration in your Astro Config. This can be your domain or localhost (localhost should only be used during development and should not be used in production).");
                };

                // Add Virtual Imports
                integrationLogger(
                    logger, verbose, "info", "Adding Virtual Imports..."
                );
                addVirtualImports( params, {
                    name,
                    imports: {
                        'virtual:astro-studio-cms:config': `export default ${ JSON.stringify(options) }`,
                    },
                })

                // dbStartPage - Choose whether to run the Start Page or Inject the Integration
                if (dbStartPage) {
                    integrationLogger(logger, true, "warn", 
                        "Start Page Enabled.  This will be the only page available until you initialize your database. To get started, visit http://localhost:4321/start/ in your browser to initialize your database. And Setup your installation.");
                    injectRoute({
                        pattern: `${base}start/`,
                        entrypoint: resolve('./pages/start.astro'),
                    });
                    injectRoute({
                        pattern: `${base}done/`,
                        entrypoint: resolve('./pages/done.astro'),
                    });

                } else {

                    // Add Page Routes
                    integrationLogger(
                        logger, verbose, "info", "Adding Page Routes..."
                    );
                    injectRoute({ 
                        pattern: base, 
                        entrypoint: resolve('./pages/index.astro'), 
                    });
                    injectRoute({ 
                        pattern: `${base}about/`, 
                        entrypoint: resolve('./pages/about.astro'), 
                    });
                    injectRoute({ 
                        pattern: `${base}blog/`, 
                        entrypoint: resolve('./pages/blog/index.astro'), 
                    });
                    injectRoute({ 
                        pattern: `${base}blog/[slug]`, 
                        entrypoint: resolve('./pages/blog/[...slug].astro'), 
                    });
                    injectRoute({ 
                        pattern: `${base}rss.xml`, 
                        entrypoint: resolve('./pages/rss.xml.ts'), 
                    });

                    if (authMode === "disable") {
                        integrationLogger(
                            logger, verbose, "warn", 
                            "Authentication Disabled. The ENTIRE Internal dashboard for the Astro Studio CMS is disabled. This means you will need to manage your content via the Astro Studio Dashboard at http://studio.astro.build"
                        );
                    } else if (authMode === "built-in") {

                        // Check for Required Environment Variables
                        if (!CMS_GITHUB_CLIENT_ID || !CMS_GITHUB_CLIENT_SECRET) {
                            throw new AstroError("GitHub OAuth Client ID and Secret are required to use Astro Studio CMS with the built-in authentication. Please add these to your .env file.");
                        };

                        // Add Authentication Middleware
                        integrationLogger(
                            logger, verbose, "info", "Adding Authentication Middleware"
                        );
                        addMiddleware({
                            entrypoint: resolve('./middleware/index.ts'),
                            order: "post",
                        });
                        injectRoute({ 
                            pattern: `${base}dashboard/`, 
                            entrypoint: resolve('./pages/dashboard/index.astro'), 
                        });
                        injectRoute({ 
                            pattern: `${base}dashboard/profile`, 
                            entrypoint: resolve('./pages/dashboard/profile.astro'), 
                        });
                        injectRoute({ 
                            pattern: `${base}dashboard/new-post`, 
                            entrypoint: resolve('./pages/dashboard/new-post.astro'), 
                        });
                        injectRoute({ 
                            pattern: `${base}dashboard/post-list`, 
                            entrypoint: resolve('./pages/dashboard/post-list.astro'), 
                        });
                        injectRoute({ 
                            pattern: `${base}dashboard/site-config`, 
                            entrypoint: resolve('./pages/dashboard/site-config.astro'), 
                        });
                        injectRoute({ 
                            pattern: `${base}dashboard/admin-config`, 
                            entrypoint: resolve('./pages/dashboard/admin-config.astro'), 
                        });
                        injectRoute({ 
                            pattern: `${base}dashboard/login`, 
                            entrypoint: resolve('./pages/dashboard/login/index.astro'), 
                        });
                        injectRoute({ 
                            pattern: `${base}dashboard/edit/home`, 
                            entrypoint: resolve('./pages/dashboard/edit/home.astro'), 
                        });
                        injectRoute({ 
                            pattern: `${base}dashboard/edit/about`, 
                            entrypoint: resolve('./pages/dashboard/edit/about.astro'), 
                        });
                        injectRoute({ 
                            pattern: `${base}dashboard/edit/[...slug]`, 
                            entrypoint: resolve('./pages/dashboard/edit/[...slug].astro'), 
                        });
                        injectRoute({ 
                            pattern: `${base}dashboard/login/github`, 
                            entrypoint: resolve('./pages/dashboard/login/github/index.ts'), 
                        });
                        injectRoute({ 
                            pattern: `${base}dashboard/login/github/callback`, 
                            entrypoint: resolve('./pages/dashboard/login/github/callback.ts'), 
                        });
                        injectRoute({ 
                            pattern: `${base}dashboard/logout`, 
                            entrypoint: resolve('./pages/dashboard/logout.ts'), 
                        });
                    } else if (authMode === "plugin") {
                        integrationLogger(
                            logger, verbose, "warn", 
                            "Authentication Plugins are not supported. Please use the built-in Astro Studio CMS authentication. or Disable Authentication in your Astro Config, to manage your content via the Astro Studio Dashboard at http://studio.astro.build"
                        );
                    }

                };

                // Update Image Service
                integrationLogger(
                    logger, verbose, "info", "Determining Image Service Configuration"
                );

                if ( adapter === vercel({ imageService: true }) ) {
                    integrationLogger(
                        logger, verbose, "info", "Vercel Adapter Detected. Using Vercel Image Service."
                    );
                } else if ( 
                    adapter === netlify() 
                    && adapter !== netlify({ imageCDN: false })
                    ) {
                    integrationLogger(
                        logger, verbose, "info", "Netlify Adapter Detected. Using Netlify Image Service."
                    );
                } else if ( 
                    adapter === cloudflare({ imageService: 'cloudflare'}) 
                    || adapter === cloudflare({ imageService: 'passthrough'}) 
                    && adapter !== cloudflare({ imageService: 'compile' }) 
                    ) {
                    integrationLogger(
                        logger, verbose, "info", "Cloudflare Adapter Detected. Using Cloudflare Image Service."
                    );
                } else if ( cdnPlugin === "cloudinary-js" ) {
                    if (!CMS_CLOUDINARY_CLOUDNAME){
                        throw new AstroError("Cloudinary Cloudname is required to use the Cloudinary CDN Plugin. Please add this to your .env file. `CMS_CLOUDINARY_CLOUDNAME`");
                    }
                    if ( astroImageServiceConfig === "squoosh" ) {
                        integrationLogger(logger, verbose, "info", "Using Squoosh Image Service as Fallback for Cloudinary CDN Plugin")
                        updateConfig({
                            image: { service: squooshImageService(), }
                        })
                    } else if ( astroImageServiceConfig === "sharp" ) {
                        integrationLogger(logger, verbose, "info", "Using Sharp Image Service as Fallback for Cloudinary CDN Plugin")
                        updateConfig({
                            image: { service: sharpImageService(), }
                        })
                    } else if ( astroImageServiceConfig === "no-op" ) {
                        integrationLogger(logger, verbose, "info", "Using No-Op Image Service as Fallback for Cloudinary CDN Plugin")
                        updateConfig({
                            image: { service: passthroughImageService(), }
                        })
                    }
                } else if ( useUnpic && astroImageServiceConfig !== "no-op" ) {
                    integrationLogger(logger, verbose, "info", "Loading @unpic/astro Image Service for External Images")
                    updateConfig({
                        image: {
                            service: unpicImageService({
                                placeholder: placeholder,
                                fallbackService: fallbackService ? fallbackService : astroImageServiceConfig,
                                layout: layout,
                                cdnOptions: cdnOptions,
                            }),
                        }
                    });
                } else if ( useUnpic && astroImageServiceConfig === "no-op" ) {
                    integrationLogger(logger, verbose, "info", "Loading @unpic/astro Image Service for External Images")
                    updateConfig({
                        image: {
                            service: unpicImageService({
                                placeholder: placeholder,
                                fallbackService: fallbackService ? fallbackService : "astro",
                                layout: layout,
                                cdnOptions: cdnOptions,
                            }),
                        }
                    });
                } else {
                    integrationLogger(logger, verbose, "info", "@unpic/astro Image Service Disabled, using Astro Built-in Image Service.")
                    if ( astroImageServiceConfig === "squoosh" ) {
                        integrationLogger(logger, verbose, "info", "Using Squoosh Image Service")
                        updateConfig({
                            image: { service: squooshImageService(), }
                        })
                    } else if ( astroImageServiceConfig === "sharp" ) {
                        integrationLogger(logger, verbose, "info", "Using Sharp Image Service")
                        updateConfig({
                            image: { service: sharpImageService(), }
                        })
                    } else if ( astroImageServiceConfig === "no-op" ) {
                        integrationLogger(logger, verbose, "info", "Using No-Op Image Service")
                        updateConfig({
                            image: { service: passthroughImageService(), }
                        })
                    }
                }

                // Robots.txt Integration
                if ( astroRobots ) {
                    if ( !hasIntegration(params, { name: "astro-robots-txt" }) 
                        || !hasIntegration( params, { name: "astro-robots" }) ) {
                        integrationLogger(logger, verbose, "info", "No Robots.txt Integration found. Adding `astro-robots` Integration")
                        addIntegration(params, { integration: robots({
                            host: site, 
                            policy: [ { 
                                userAgent: ["*"],
                                allow: ["/"],
                                disallow: ["/dashboard/"],
                            }, ],
                        })});
                    }
                }

                // Sitemap Integration
                if ( inoxSitemap ) {
                    if ( !hasIntegration(params, { name: "@astrojs/sitemap" }) 
                    || !hasIntegration(params, { name: "@inox-tools/sitemap-ext"}) ) {
                        integrationLogger(logger, verbose, "info", "No Sitemap Integration found. Adding `@inox-tools/sitemap-ext` Integration")
                        addIntegration(params, { integration: sitemap({ includeByDefault: false }) });
                    }
                }

                integrationLogger(
                    logger, verbose, "info", "Astro Studio CMS Setup Complete!"
                );

            },
            'astro:server:start': ({ logger }) => {
                if (dbStartPage) {
                    integrationLogger(
                        logger, true, "warn", "Astro Studio CMS is running in Development Mode. To get started, visit http://localhost:4321/start in your browser to initialize your database. And Setup your installation."
                    );
                };
            },
        };
    },
});