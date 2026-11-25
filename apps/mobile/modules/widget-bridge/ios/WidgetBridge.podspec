Pod::Spec.new do |s|
  s.name           = 'WidgetBridge'
  s.version        = '0.1.0'
  s.summary        = 'Writes one value to the App Group for the mongmangE widget'
  s.description    = 'Local Expo module (C10 slot): App Group UserDefaults write + WidgetCenter reload. Widget UI is C3.'
  s.license        = { :type => 'UNLICENSED' }
  s.author         = 'mongmangE'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'WidgetKit'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
