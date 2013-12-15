﻿define([
    'dataSourceType',
    'youTubeV2API',
    'youTubeV3API'
], function (DataSourceType, YouTubeV2API, YouTubeV3API) {
    'use strict';

    var DataSource = Backbone.Model.extend({
        
        defaults: {
            type: DataSourceType.None,
            //  The videoId, playlistId, channelId etc..
            sourceId: '',
            url: '',
            title: ''
        },
        
        initialize: function (options) {

            if (options && options.urlToParse) {
                var parsedDataSourceInformation = this.parseUrlForDataSourceInformation(options.urlToParse);
                this.set('type', parsedDataSourceInformation.dataSourceType);
                this.set('sourceId', parsedDataSourceInformation.dataSourceId);

                delete options.urlToParse;
            }

            this.setUrl();
            this.on('change:type', this.setUrl);
        },
        
        setUrl: function () {

            //  Craft an appropriate URL based off of the dataSource type and ID
            var url = 'https://gdata.youtube.com/feeds/api/';

            switch (this.get('type')) {
                case DataSourceType.YouTubeChannel:
                    url += 'users/' + this.get('sourceId') + '/uploads';
                    break;
                case DataSourceType.YouTubeFavorites:
                    url += 'users/' + this.get('sourceId') + '/favorites';
                    break;
                case DataSourceType.YouTubePlaylist:
                    url += 'playlists/' + this.get('sourceId');
                    break;
                default:
                    //  Other data source types don't have a URL because they don't need loading.
                    url = '';
            }

            this.set('url', url);

        },
        
        //  These dataSourceTypes require using YouTube V3 API to retrieve their information.
        isV3: function () {

            var type = this.get('type');

            return type === DataSourceType.YouTubeAutoGenerated;
        },

        //  These dataSourceTypes require going out to a server and collecting a list of information in order to be created.
        needsLoading: function () {

            var type = this.get('type');

            return type === DataSourceType.YouTubeChannel || type === DataSourceType.YouTubePlaylist ||
                type === DataSourceType.YouTubeFavorites || type === DataSourceType.YouTubeAutoGenerated;
        },

        parseUrlForDataSourceInformation: function (urlToParse) {
            
            var dataSourceType = DataSourceType.None;
            var dataSourceId = '';

            var dataSourceOptions = [{
                identifiers: ['list=PL', 'p=PL', 'list=RD', 'p=RD'],
                dataSourceType: DataSourceType.YouTubePlaylist
            }, {
                identifiers: ['list=FL', 'p=FL'],
                dataSourceType: DataSourceType.YouTubeFavorites
            }, {
                identifiers: ['list=AL', 'p=AL'],
                dataSourceType: DataSourceType.YouTubeAutoGenerated
            }, {
                identifiers: ['/user/', '/channel/', 'list=UU', 'p=UU'],
                dataSourceType: DataSourceType.YouTubeChannel
            }, {
                identifiers: ['streamus:'],
                dataSourceType: DataSourceType.SharedPlaylist
            }];

            var tryGetIdFromUrl = function (url, identifier) {
                var urlTokens = url.split(identifier);

                var parsedDataSourceId = '';

                if (urlTokens.length > 1) {
                    parsedDataSourceId = url.split(identifier)[1];

                    var ampersandPosition = parsedDataSourceId.indexOf('&');
                    if (ampersandPosition !== -1) {
                        parsedDataSourceId = parsedDataSourceId.substring(0, ampersandPosition);
                    }

                    //  Starting in v3 YouTube API wants the full identifier at the front of the dataSource.
                    if (identifier === 'list=AL' || identifier === 'p=AL') {
                        parsedDataSourceId = 'AL' + parsedDataSourceId;
                    }
                    else if (identifier === 'list=RD' || identifier === 'p=RD') {
                        parsedDataSourceId = 'RD' + parsedDataSourceId;
                    }
                }

                return parsedDataSourceId;
            };

            //  Find whichever option works.
            _.each(dataSourceOptions, function (dataSourceOption) {

                var validIdentifier = _.find(dataSourceOption.identifiers, function (identifier) {
                    var parsedDataSourceId = tryGetIdFromUrl(urlToParse, identifier);
                    return parsedDataSourceId !== '';
                });

                if (validIdentifier !== undefined) {
                    dataSourceId = tryGetIdFromUrl(urlToParse, validIdentifier);
                    dataSourceType = dataSourceOption.dataSourceType;
                }

            });

            //  Still nothing found? Try parsing out a YouTube video ID.
            if (dataSourceType === DataSourceType.None) {
                var videoId = this.parseYouTubeVideoIdFromUrl(urlToParse);
                
                if (videoId) {
                    dataSourceId = videoId;
                    dataSourceType = DataSourceType.YouTubeVideo;
                }
            }

            return {
                dataSourceType: dataSourceType,
                dataSourceId: dataSourceId
            };
        },
        
        //  Takes a URL and returns parsed URL information such as schema and video id if found inside of the URL.
        parseYouTubeVideoIdFromUrl: function (url) {
            var videoId = null;

            var match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|watch\?.*?\&v=)([^#\&\?]*).*/);
            if (match && match[2].length === 11) {
                videoId = match[2];
            }

            return videoId;
        },
        
        //  Expects options: { success: function, error: function }
        getTitle: function (options) {
            //  Support calling without paramaters just in case.
            options = $.extend({}, {
                success: function () { },
                error: function () { },
                //  Allow for console.error stifling
                notifyOnError: true
        }, options);
            
            //  If the title has already been fetched from the URL -- return the cached one.
            if (this.get('title') !== '') {
                options.success(this.get('title'));
                return;
            }

            var self = this;
            switch (this.get('type')) {
                case DataSourceType.YouTubePlaylist:

                    YouTubeV2API.getPlaylistTitle({
                        playlistId: this.get('sourceId'),
                        success: function (youTubePlaylistTitle) {
                            self.set('title', youTubePlaylistTitle);
                            options.success(youTubePlaylistTitle);
                        },
                        error: options.error
                    });

                    break;
                case DataSourceType.YouTubeFavorites:
                case DataSourceType.YouTubeChannel:

                    YouTubeV2API.getChannelName({
                        channelId: this.get('sourceId'),
                        success: function (channelName) {
                            self.set('title', channelName);
                            options.success(channelName);
                        },
                        error: options.error
                    });

                    break;
                    //  TODO: Need to support getting shared playlist information.
                    //case DataSource.SHARED_PLAYLIST:
                    //    self.model.addPlaylistByDataSource('', dataSource);
                    //    break;
                case DataSourceType.YouTubeAutoGenerated:

                    //  TODO: error isn't uspported in v3 stuff yet
                    YouTubeV3API.getAutoGeneratedPlaylistTitle(this.get('sourceId'), function (autoGeneratedPlaylistTitle) {
                        self.set('title', autoGeneratedPlaylistTitle);
                        options.success(autoGeneratedPlaylistTitle);
                    });

                    break;
                default:
                    if (options.notifyOnError) {
                        console.error("Unhandled dataSource type:", this.get('type'));
                    }
                    
                    options.error();
            }
        }

    });

    return DataSource;
});